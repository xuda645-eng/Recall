import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import combined_batch as combined
import recall_batch as batch
from media_package import pack
from PIL import Image, ImageDraw


PROJECT = Path(os.environ.get('RECALL_PROJECT', Path(__file__).resolve().parents[4])).resolve()
AVAILABLE = shutil.which('node') and (PROJECT / 'node_modules/vite/dist/node/index.js').is_file()


def document(document_id, content):
    return {'ok': True, 'data': {'document': {'document_id': document_id, 'revision_id': 1,
            'content': f'<title id="{document_id}">Training {document_id}</title>' + content}}}


def marked(text):
    return f'<span background-color="{batch.YELLOW}">{text}</span>'


class CombinedSourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.image = self.root / 'image.png'
        image = Image.new('RGB', (160, 120), 'white')
        ImageDraw.Draw(image).rectangle((10, 20, 150, 100), outline='red', width=3)
        image.save(self.image)
        self.annotation = {'source_document_id': 'docNotes', 'revision': 1, 'images': [{
            'block_key': 'shared', 'file': 'image.png', 'sha256': hashlib.sha256(self.image.read_bytes()).hexdigest(),
            'decision': 'selected', 'regions': [{'key': 'frame', 'bounds': [0.1, 0.2, 0.9, 0.8], 'verified': True,
                'segments': [{'key': 'flow', 'text': 'Step A precedes step B.', 'representation': 'diagram'}]}]}]}
        self.selection = self.root / 'selections.json'
        batch.exclusive_json(self.selection, self.annotation)
        batch.exclusive_json(self.root / 'lecture.json', document('docLecture',
            '<p id="shared">' + marked('Definition: a staged process.') + '</p>'
            '<p id="mechanism">' + marked('Confirm the input before step A.') + '</p>'))
        batch.exclusive_json(self.root / 'notes.json', document('docNotes', '<p id="outside">Unmarked context only.</p><img id="shared" src="mediaToken"/>'))
        self.collection = {'same_topic_confirmed': True, 'topic_key': 'training-example', 'title': 'Training example',
            'sources': [{'key': 'lecture', 'mode': 'yellow', 'url': 'https://example.larkoffice.com/docx/docLecture', 'file': 'lecture.json'},
                        {'key': 'notes', 'mode': 'screenshots', 'url': 'https://example.larkoffice.com/docx/docNotes',
                         'file': 'notes.json', 'selections': 'selections.json'}]}
        self.source_set = self.root / 'sources.json'
        batch.exclusive_json(self.source_set, self.collection)

    def tearDown(self):
        self.temporary.cleanup()

    def extraction(self):
        return combined.extract(self.source_set)

    def plan(self, extraction=None):
        extraction = extraction or self.extraction()
        return {'topic_key': self.collection['topic_key'], 'source_document_id': extraction['source_document_id'],
                'revision': extraction['revision'], 'hierarchy_confirmed': True, 'allowed_paths': [['Training']],
                'import_parent': None, 'learning_path': ['Concept first', 'Mechanism and dependency second'],
                'cards': [{'path': ['Training'], 'front': 'What is the process?', 'unit_key': 'concept',
                           'question_origin': 'inferred', 'question_note': 'Concept prerequisite',
                           'answer': 'A staged process.', 'refs': [{'source': 'lecture', 'block_key': 'shared', 'run_index': 0}]},
                          {'path': ['Training'], 'front': 'How do the stages depend on the input?', 'unit_key': 'mechanism',
                           'question_origin': 'inferred', 'question_note': 'Link input and diagram sequence',
                           'answer': 'Confirm the input, perform A, then B.', 'refs': [
                               {'source': 'lecture', 'block_key': 'mechanism', 'run_index': 0},
                               {'source': 'notes', 'block_key': 'shared:frame:flow', 'run_index': 0}]}],
                'resource_decisions': [{'source': 'notes', 'key': 'shared', 'reason': 'Synthetic screenshot reviewed'}]}

    def build(self, draft=None, extraction=None, history=None, include=False):
        extraction = extraction or self.extraction()
        return batch.build_cards(extraction, combined.prepare_plan(extraction, draft or self.plan(extraction)), history or {}, include)

    def test_source_qualified_evidence_and_mixed_card_answers(self):
        extraction = self.extraction()
        self.assertEqual(len(extraction['highlights']), 3)
        self.assertEqual(len({entry['block_key'] for entry in extraction['highlights']}), 3)
        cards, _, _, coverage = self.build(extraction=extraction)
        self.assertEqual(len(cards), 2)
        self.assertNotIn('screenshot', cards[0]['evidence'][0])
        self.assertEqual(cards[1]['evidence'][1]['source']['source_document_id'], 'docNotes')
        self.assertIn('### 来源证据', cards[0]['back'])
        self.assertIn('标黄原文', cards[1]['back'])
        self.assertIn('截图红框转录', cards[1]['back'])
        self.assertNotIn('Unmarked context', cards[1]['back'])
        self.assertEqual(len(coverage), 3)

    def test_unconfirmed_duplicate_and_raw_minutes_sources_rejected(self):
        for mutation in ['topic', 'alias', 'document', 'minutes']:
            collection = copy.deepcopy(self.collection)
            if mutation == 'topic':
                collection['same_topic_confirmed'] = False
            elif mutation == 'alias':
                collection['sources'][1]['key'] = 'lecture'
            elif mutation == 'document':
                collection['sources'].append({**collection['sources'][0], 'key': 'duplicate'})
            else:
                collection['sources'][0]['mode'] = 'minutes'
            self.source_set.write_text(batch.dump_json(collection))
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.extraction()

    def test_local_sources_cannot_escape_or_fake_selection_versions(self):
        for field, value in [('file', str(self.root / 'lecture.json')), ('file', '../outside.json')]:
            collection = copy.deepcopy(self.collection)
            collection['sources'][0][field] = value
            self.source_set.write_text(batch.dump_json(collection))
            with self.assertRaises((ValueError, FileNotFoundError)):
                self.extraction()
        self.source_set.write_text(batch.dump_json(self.collection))
        self.annotation['revision'] = 2
        self.selection.write_text(batch.dump_json(self.annotation))
        with self.assertRaisesRegex(ValueError, 'revision mismatch'):
            self.extraction()

    def test_wrong_source_or_unknown_refs_rejected(self):
        for field, value in [('source', 'wrong'), ('block_key', 'invented'), ('run_index', True)]:
            draft = self.plan()
            draft['cards'][0]['refs'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.build(draft)

    def test_paths_revision_learning_path_and_unit_required(self):
        for field, value in [('learning_path', []), ('revision', 'wrong'), ('hierarchy_confirmed', False), ('topic_key', 'wrong')]:
            draft = self.plan()
            draft[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.build(draft)
        draft = self.plan()
        draft['cards'][0].pop('unit_key')
        with self.assertRaisesRegex(ValueError, 'unit_key'):
            self.build(draft)

    def test_unaccounted_evidence_and_free_back_rejected(self):
        draft = self.plan()
        draft['cards'].pop()
        with self.assertRaisesRegex(ValueError, 'Unaccounted'):
            self.build(draft)
        draft = self.plan()
        draft['cards'][0]['back'] = 'Not a generated evidence section'
        with self.assertRaisesRegex(ValueError, 'Unexpected'):
            self.build(draft)

    def test_reordering_sources_keeps_ids_and_signature(self):
        extraction = self.extraction()
        cards = self.build(extraction=extraction)[0]
        self.collection['sources'].reverse()
        self.source_set.write_text(batch.dump_json(self.collection))
        reordered = self.extraction()
        self.assertEqual(reordered['revision'], extraction['revision'])
        new_cards, skipped, _, _ = self.build(extraction=reordered, history={card['id']: card for card in cards})
        self.assertFalse(new_cards)
        self.assertEqual(len(skipped), 2)

    def test_new_evidence_for_same_unit_preserves_id_as_update(self):
        old_cards = self.build()[0]
        draft = self.plan()
        draft['cards'][0]['front'] = 'How should this concept be understood?'
        draft['cards'][0]['answer'] = 'This is a process organized into stages.'
        updated = self.build(draft, history={card['id']: card for card in old_cards})[0]
        self.assertEqual(len(updated), 1)
        self.assertEqual(updated[0]['id'], old_cards[0]['id'])
        self.assertTrue(updated[0]['change_candidate'])

    def test_visual_transcription_change_invalidates_revision(self):
        extraction = self.extraction()
        self.annotation['images'][0]['regions'][0]['segments'][0]['text'] = 'Revised diagram relation.'
        self.selection.write_text(batch.dump_json(self.annotation))
        self.assertNotEqual(self.extraction()['revision'], extraction['revision'])

    def test_conflicting_evidence_can_be_left_unresolved(self):
        draft = self.plan()
        mixed = draft['cards'].pop()
        draft['unresolved'] = [{'reason': 'Sources disagree on the stage order.', 'refs': mixed['refs']}]
        cards, _, unresolved, _ = self.build(draft)
        self.assertEqual(len(cards), 1)
        self.assertIn('Step A precedes', unresolved[0]['text'])

    def test_duplicate_facts_combine_into_one_learning_unit(self):
        batch.exclusive_json(self.root / 'duplicate.json', document('docDuplicate', '<p id="fact">' + marked('Definition: a staged process.') + '</p>'))
        self.collection['sources'].append({'key': 'duplicate', 'mode': 'yellow',
            'url': 'https://example.larkoffice.com/docx/docDuplicate', 'file': 'duplicate.json'})
        self.source_set.write_text(batch.dump_json(self.collection))
        draft = self.plan()
        draft['cards'][0]['refs'].append({'source': 'duplicate', 'block_key': 'fact', 'run_index': 0})
        cards = self.build(draft)[0]
        self.assertEqual(len(cards), 2)
        self.assertEqual(len(cards[0]['evidence']), 2)
        self.assertEqual(cards[0]['back'].split('### 来源证据')[0].strip(), 'A staged process.')

    @unittest.skipUnless(AVAILABLE, 'Actual Recall parser dependencies required')
    def test_actual_archive_mixed_package_repeat_updates_and_progress(self):
        project = self.root / 'project'
        shutil.copytree(PROJECT / 'src', project / 'src')
        (project / 'node_modules').symlink_to(PROJECT / 'node_modules', target_is_directory=True)
        config = batch.configure(project, 'src/lib/memory-markdown.ts', 'Asia/Shanghai')
        extraction = self.extraction()
        draft = self.plan(extraction)
        lecture = batch.extract_source(batch.read_json(self.root / 'lecture.json'), self.collection['sources'][0]['url'])
        legacy_plan = {'source_document_id': 'docLecture', 'revision': 1, 'hierarchy_confirmed': True,
            'allowed_paths': [['Training']], 'import_parent': None,
            'cards': [{'path': ['Training'], 'front': 'What is the process?', 'question_origin': 'inferred',
                       'question_note': 'Original concept card', 'unit_key': 'concept',
                       'refs': [{'block_key': 'shared', 'run_index': 0}]}],
            'context_refs': [{'block_key': 'mechanism', 'run_index': 0}]}
        legacy = batch.create_archive(project, config, lecture, legacy_plan)
        legacy_id = batch.read_json(Path(legacy['batch_directory']) / 'manifest.json')['cards'][0]['id']
        draft['cards'][0].update({'existing_id': legacy_id, 'identity_note': 'Confirmed same concept from the supplied lecture'})
        prepared = combined.prepare_plan(extraction, draft)
        draft_path = self.root / 'plan.json'
        batch.exclusive_json(draft_path, draft)
        archive_command = subprocess.run([sys.executable, str(Path(combined.__file__)), 'archive',
            '--project', str(project), '--sources', str(self.source_set), '--plan', str(draft_path), '--confirm'],
            capture_output=True, text=True, timeout=120)
        self.assertEqual(archive_command.returncode, 0, archive_command.stdout + archive_command.stderr)
        archived = json.loads(archive_command.stdout)
        self.assertEqual(archived['validation']['against_history']['changes'], 1)
        self.assertEqual(archived['validation']['against_history']['added'], 1)
        folder = Path(archived['batch_directory'])
        original_manifest = (folder / 'manifest.json').read_bytes()
        original_markdown = Path(archived['files'][0]).read_bytes()
        output = folder / 'mixed.recall-media.json'
        report = pack(folder, self.selection, output)
        self.assertEqual((report['cards'], report['images']), (2, 1))
        value = batch.read_json(output)
        self.assertEqual(value['markdown'].count('recall://'), 1)
        self.assertIn('What is the process?', value['markdown'])
        self.assertEqual((folder / 'manifest.json').read_bytes(), original_manifest)
        self.assertEqual(Path(archived['files'][0]).read_bytes(), original_markdown)
        result = subprocess.run(['node', str(PROJECT / 'scripts/verify-media-package.mjs'), str(output)],
                                cwd=PROJECT, capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        reports = [json.loads(line) for line in result.stdout.splitlines()
                   if line.startswith('{"status":"validated_in_memory_only"')]
        self.assertEqual(len(reports), 1, result.stdout + result.stderr)
        self.assertEqual(reports[0]['repeatedSkipped'], 2)
        self.assertEqual((report['cards_with_images'], report['cards_without_images']), (1, 1))
        expected_cards = copy.deepcopy(batch.read_json(folder / 'manifest.json')['cards'])
        expected_cards[1]['back'] += '\n\n![来源截图](recall://' + value['images'][0]['id'] + ')'
        verification_request = self.root / 'mixed-request.json'
        batch.exclusive_json(verification_request, {'project': str(project), 'parser': config['parser'],
            'documents': [{'name': 'mixed.md', 'text': value['markdown'], 'expected': expected_cards}],
            'history': [], 'import_parent': None})
        mixed_result = subprocess.run(['node', str(Path(batch.__file__).with_name('verify_recall.mjs')), str(verification_request)],
            capture_output=True, text=True, timeout=120)
        self.assertEqual(mixed_result.returncode, 0, mixed_result.stdout + mixed_result.stderr)
        self.assertTrue(json.loads(mixed_result.stdout)['review_progress_preserved'])
        self.assertTrue(archived['validation']['review_progress_preserved'])
        self.assertFalse(archived['validation']['database_accessed'])
        self.assertEqual(batch.create_archive(project, config, extraction, prepared)['status'], 'no_changes')
        draft['cards'][0]['answer'] = 'A process organized into sequential stages.'
        revised = batch.create_archive(project, config, extraction, combined.prepare_plan(extraction, draft))
        self.assertEqual(revised['validation']['against_history']['changes'], 1)
        self.assertEqual(revised['validation']['against_history']['updated'], 0)
        self.assertEqual(revised['validation']['confirmed_history_updates']['updated'], 1)
        self.assertEqual(batch.rebuild_index(project)['batches'], 3)
        self.assertIn('mixed.recall-media.json', (project / 'card-imports/index.md').read_text())
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            pack(folder, self.selection, output)

    def synthetic_manifest(self, cards, sources=None):
        folder = self.root / 'pack-test'
        folder.mkdir(exist_ok=True)
        batch.exclusive_json(folder / 'manifest.json', {'source_mode': 'combined', 'sources': sources or self.extraction()['sources'], 'cards': cards})
        return folder

    def test_missing_selections_or_altered_image_evidence_rejected(self):
        cards = self.build()[0]
        folder = self.synthetic_manifest(cards)
        with self.assertRaisesRegex(ValueError, 'same document'):
            pack(folder, [], self.root / 'missing.json')
        cards[1]['evidence'][1]['screenshot']['sha256'] = 'wrong'
        (folder / 'manifest.json').write_text(batch.dump_json({'source_mode': 'combined', 'sources': self.extraction()['sources'], 'cards': cards}))
        with self.assertRaisesRegex(ValueError, 'reviewed source image'):
            pack(folder, self.selection, self.root / 'altered.json')

    def test_same_image_ids_across_documents_do_not_collide_and_bytes_deduplicate(self):
        cards = self.build()[0]
        third = copy.deepcopy(cards[1])
        third['id'] = 'third-card'
        third['front'] = 'Other screenshot source?'
        third['evidence'] = [third['evidence'][1]]
        third['evidence'][0]['source']['source_document_id'] = 'docOther'
        annotation = copy.deepcopy(self.annotation)
        annotation['source_document_id'] = 'docOther'
        second_selection = self.root / 'second-selections.json'
        batch.exclusive_json(second_selection, annotation)
        sources = self.extraction()['sources'] + [{'source_document_id': 'docOther', 'mode': 'screenshots', 'revision': 1}]
        folder = self.synthetic_manifest(cards + [third], sources)
        report = pack(folder, [self.selection, second_selection], self.root / 'shared-images.json')
        self.assertEqual((report['cards'], report['images']), (3, 1))
        with self.assertRaisesRegex(ValueError, 'duplicates'):
            pack(folder, [self.selection, self.selection], self.root / 'duplicate-input.json')

    def test_text_only_card_does_not_acquire_unrelated_images(self):
        folder = self.synthetic_manifest(self.build()[0][:1])
        output = self.root / 'text-only.json'
        report = pack(folder, self.selection, output)
        self.assertEqual((report['cards_without_images'], report['images']), (1, 0))
        self.assertEqual(batch.read_json(output)['images'], [])
        self.assertNotIn('recall://', batch.read_json(output)['markdown'])

    def test_final_card_limits_include_citations_and_image_references(self):
        cards = self.build()[0]
        cards[1]['back'] = 'text' * 5000
        folder = self.synthetic_manifest(cards)
        output = self.root / 'oversized.json'
        with self.assertRaisesRegex(ValueError, '20000'):
            pack(folder, self.selection, output)
        self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
