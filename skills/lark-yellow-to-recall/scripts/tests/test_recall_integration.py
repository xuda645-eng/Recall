import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


PROJECT = Path(os.environ.get('RECALL_PROJECT', Path(__file__).resolve().parents[4])).resolve()
SCRIPT = Path(__file__).resolve().parents[1] / 'recall_batch.py'
SPEC = importlib.util.spec_from_file_location('recall_batch_integration', SCRIPT)
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
AVAILABLE = shutil.which('node') and (PROJECT / 'node_modules/vite/dist/node/index.js').is_file() and (PROJECT / 'src/lib/memory-markdown.ts').is_file()


@unittest.skipUnless(AVAILABLE, 'Actual Recall project and installed Node/Vite dependencies required')
class RecallIntegrationTests(unittest.TestCase):
    def verify(self, cards, history=None, parent=None):
        documents = [{'name': f'cards-{index}.md', 'text': batch.serialize_cards(part), 'expected': part}
                     for index, part in enumerate(batch.split_cards(cards))]
        request = {'project': str(PROJECT), 'parser': 'src/lib/memory-markdown.ts', 'documents': documents,
                   'history': history or [], 'import_parent': parent}
        with tempfile.TemporaryDirectory() as temporary:
            input_path = Path(temporary) / 'request.json'
            input_path.write_text(json.dumps(request, ensure_ascii=False))
            result = subprocess.run(['node', str(SCRIPT.with_name('verify_recall.mjs')), str(input_path)],
                                    capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return json.loads(result.stdout)

    def card(self, card_id, path, front='问题？', back='答案。'):
        return {'id': card_id, 'path': path, 'front': front, 'back': back}

    def test_ancestor_and_sibling_paths_with_existing_parent(self):
        cards = [self.card('ancestor-1', ['一级', '二级']), self.card('ancestor-2', ['一级']),
                 self.card('ancestor-3', ['另一一级', '子级'], back='段落一\n\n段落二')]
        result = self.verify(cards, parent=['已有父卡组'])
        self.assertEqual(result['first_import']['added'], 3)
        self.assertTrue(result['review_progress_preserved'])

    def test_1001_cards_split_into_independent_files(self):
        cards = [self.card(f'split-{index}', ['拆分卡组'], front=f'问题 {index}？') for index in range(1001)]
        result = self.verify(cards)
        self.assertEqual(result['cards'], 1001)
        self.assertEqual(result['repeat_import']['skipped'], 1001)

    def test_next_batch_with_missing_old_rows_preserves_progress(self):
        old_cards = [self.card('delta-change', ['增量'], back='原文'), self.card('delta-keep', ['增量'], back='旧卡保留')]
        historical = [{'documents': [{'name': 'original.md', 'text': batch.serialize_cards(old_cards), 'expected': old_cards}],
                       'import_parent': None}]
        next_cards = [self.card('delta-change', ['增量'], back='修订原文'), self.card('delta-new', ['增量'], back='新增')]
        result = self.verify(next_cards, history=historical)
        self.assertEqual(result['against_history']['added'], 1)
        self.assertEqual(result['against_history']['changes'], 1)
        self.assertEqual(result['against_history']['updated'], 0)
        self.assertEqual(result['confirmed_history_updates']['updated'], 1)
        self.assertTrue(result['old_cards_preserved'])

    def test_literal_dollar_replacement_and_maximum_question_length(self):
        cards = [self.card('literal-dollar', ['字面字符'], front='价格 $& 与 $$ 怎么理解？'),
                 self.card('maximum-question', ['字面字符'], front='问' * 10000)]
        for card in cards:
            result = self.verify([card])
            self.assertEqual(result['cards'], 1)
            self.assertTrue(result['explicit_update_verified'])


if __name__ == '__main__':
    unittest.main()
