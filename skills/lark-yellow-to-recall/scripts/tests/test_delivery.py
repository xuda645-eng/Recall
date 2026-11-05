import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import deliver
import recall_batch as batch
from media_package import pack
from PIL import Image


PROJECT = Path(os.environ.get('RECALL_PROJECT', Path(__file__).resolve().parents[4])).resolve()
AVAILABLE = shutil.which('node') and (PROJECT / 'node_modules/vite/dist/node/index.js').is_file()
TOPIC = '\u4e3b\u4ea4\u4e92'


class TopicTests(unittest.TestCase):
    def test_short_topic_rejects_long_and_unsafe_names(self):
        self.assertEqual(deliver.short_topic(TOPIC), TOPIC)
        for name in ['', ' topic', '../outside', 'A/B', 'A\\B', '.hidden', 'topic.', 'A' * 21, 'bad\nname']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                deliver.short_topic(name)


@unittest.skipUnless(AVAILABLE, 'Actual Recall parser dependencies required')
class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.project = self.root / 'project'
        shutil.copytree(PROJECT / 'src', self.project / 'src')
        shutil.copytree(PROJECT / 'shared', self.project / 'shared')
        (self.project / 'node_modules').symlink_to(PROJECT / 'node_modules', target_is_directory=True)
        batch.configure(self.project, 'src/lib/memory-markdown.ts', 'Asia/Shanghai')

    def tearDown(self):
        self.temporary.cleanup()

    def fixture(self, key='example', split=False):
        folder = self.project / 'card-imports/batches' / key
        folder.mkdir(parents=True)
        cards = [{'id': key + '-card', 'path': ['Training'], 'front': 'Question?', 'back': 'Selected answer.',
                  'evidence': [{'block_key': 'text', 'run_index': 0}]}]
        if split:
            cards.append({**cards[0], 'id': key + '-second'})
        files = []
        for index, part in enumerate(([card] for card in cards) if split else [cards], 1):
            name = f'cards-{key}-{index:03}.md'
            text = batch.serialize_cards(part)
            (folder / name).write_text(text)
            files.append({'name': name, 'card_count': len(part), 'sha256': hashlib.sha256(text.encode()).hexdigest()})
        manifest = {'batch': key, 'status': 'generated', 'created_at': '2026-11-04T18:30:00-07:00',
                    'source_url': 'https://example.com/doc', 'source_document_id': 'doc', 'revision': 1,
                    'card_count': len(cards), 'cards': cards, 'files': files, 'import_parent': ['Parent'],
                    'validation': {'status': 'passed'}}
        batch.exclusive_json(folder / 'manifest.json', manifest)
        return folder, manifest

    def media_fixture(self, mixed=False):
        folder, manifest = self.fixture()
        original = self.root / 'source.png'
        Image.new('RGB', (24, 24), 'white').save(original)
        manifest['source_mode'] = 'screenshots'
        manifest['cards'][0]['evidence'] = [{'block_key': 'image:frame:unit', 'run_index': 0}]
        if mixed:
            manifest['source_mode'] = 'combined'
            manifest['sources'] = [{'source_document_id': 'doc', 'revision': 1, 'mode': 'screenshots'},
                                   {'source_document_id': 'lecture', 'revision': 1, 'mode': 'yellow'}]
            manifest['cards'][0]['evidence'] = [{'block_key': 'image:frame:unit', 'run_index': 0,
                'source': {'source_document_id': 'doc', 'mode': 'screenshots'},
                'screenshot': {'block_key': 'image', 'sha256': deliver.checksum(original)}}]
            manifest['cards'].append({'id': 'text-card', 'path': ['Training'], 'front': 'Text question?',
                'back': 'Text answer.', 'evidence': [{'block_key': 'text', 'run_index': 0,
                    'source': {'source_document_id': 'lecture', 'mode': 'yellow'}}]})
            manifest['card_count'] = 2
            markdown = folder / manifest['files'][0]['name']
            markdown.write_text(batch.serialize_cards(manifest['cards']))
            manifest['files'][0].update({'card_count': 2, 'sha256': deliver.checksum(markdown)})
        (folder / 'manifest.json').write_text(batch.dump_json(manifest))
        selections = self.root / 'selections.json'
        selections.write_text(batch.dump_json({'source_document_id': 'doc', 'revision': 1, 'images': [
            {'block_key': 'image', 'decision': 'selected', 'file': original.name, 'sha256': deliver.checksum(original)}]}))
        package = folder / 'long-batch-name.recall-media.json'
        pack(folder, selections, package)
        return folder, manifest, package

    def test_shallow_short_name_date_timezone_bytes_and_repeated_delivery(self):
        folder, manifest = self.fixture()
        before = {path.name: path.read_bytes() for path in folder.iterdir()}
        result = deliver.deliver(self.project, folder, TOPIC)
        destination = self.project / deliver.DESTINATION_NAME / (TOPIC + '-2026-11-05.md')
        self.assertEqual(result['main_file'], str(destination))
        self.assertEqual(destination.read_bytes(), before[manifest['files'][0]['name']])
        self.assertEqual(result['validation']['repeat_import']['skipped'], 1)
        self.assertTrue(result['validation']['review_progress_preserved'])
        repeated = deliver.deliver(self.project, folder, TOPIC)
        self.assertTrue(repeated['reused'])
        self.assertEqual(len(list(destination.parent.iterdir())), 1)
        for name, contents in before.items():
            self.assertEqual((folder / name).read_bytes(), contents)

    def test_same_topic_date_collision_appends_short_sequence_without_overwrite(self):
        first, _ = self.fixture('first')
        second, _ = self.fixture('second')
        original = deliver.deliver(self.project, first, TOPIC)
        original_bytes = Path(original['main_file']).read_bytes()
        newer = deliver.deliver(self.project, second, TOPIC)
        self.assertEqual(Path(newer['main_file']).name, TOPIC + '-2026-11-05-2.md')
        self.assertEqual(Path(original['main_file']).read_bytes(), original_bytes)

    def test_split_markdown_all_parts_have_short_names(self):
        folder, _ = self.fixture(split=True)
        result = deliver.deliver(self.project, folder, TOPIC)
        self.assertEqual([Path(item['path']).name for item in result['files']],
                         [TOPIC + '-2026-11-05-01.md', TOPIC + '-2026-11-05-02.md'])
        self.assertEqual(result['validation']['cards'], 2)

    def test_media_delivery_preserves_package_and_checks_actual_media_parser(self):
        folder, manifest, package = self.media_fixture()
        before = package.read_bytes()
        result = deliver.deliver(self.project, folder, TOPIC)
        self.assertEqual(Path(result['main_file']).name, TOPIC + '-2026-11-05.recall-media.json')
        self.assertEqual(Path(result['main_file']).read_bytes(), before)
        self.assertEqual(result['validation']['media']['images'], 1)
        self.assertTrue(result['validation']['explicit_update_verified'])
        self.assertEqual(batch.read_json(folder / 'manifest.json'), manifest)

    def test_changed_package_question_blocks_delivery(self):
        folder, _, package = self.media_fixture()
        payload = batch.read_json(package)
        payload['markdown'] = payload['markdown'].replace('Question?', 'Changed question?')
        package.write_text(json.dumps(payload))
        with self.assertRaisesRegex(ValueError, 'identity and questions'):
            deliver.deliver(self.project, folder, TOPIC)
        self.assertFalse((self.project / deliver.DESTINATION_NAME).exists())

    def test_mixed_media_delivery_preserves_text_and_illustrated_cards(self):
        folder, _, _ = self.media_fixture(mixed=True)
        result = deliver.deliver(self.project, folder, TOPIC)
        self.assertEqual(result['validation']['cards'], 2)
        self.assertEqual(result['validation']['media']['images'], 1)
        self.assertEqual(result['validation']['repeat_import']['skipped'], 2)

    def test_changed_archive_and_unvalidated_archive_cannot_deliver(self):
        folder, manifest = self.fixture()
        markdown = folder / manifest['files'][0]['name']
        original = markdown.read_text()
        markdown.write_text(original + 'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            deliver.deliver(self.project, folder, TOPIC)
        markdown.write_text(original)
        manifest['validation']['status'] = 'failed'
        (folder / 'manifest.json').write_text(batch.dump_json(manifest))
        with self.assertRaisesRegex(ValueError, 'passed'):
            deliver.deliver(self.project, folder, TOPIC)
        self.assertFalse((self.project / deliver.DESTINATION_NAME).exists())

    def test_changed_delivered_file_is_not_overwritten(self):
        folder, _ = self.fixture()
        result = deliver.deliver(self.project, folder, TOPIC)
        path = Path(result['main_file'])
        path.write_text('Owner edit')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            deliver.deliver(self.project, folder, TOPIC)
        self.assertEqual(path.read_text(), 'Owner edit')

    def test_unsafe_paths_missing_package_and_git_privacy_guard(self):
        folder, manifest = self.fixture()
        output = self.project / deliver.DESTINATION_NAME
        output.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            deliver.deliver(self.project, folder, TOPIC)
        output.unlink()
        (self.project / '.git').mkdir()
        with patch.object(deliver.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaisesRegex(ValueError, 'Ignore'):
                deliver.deliver(self.project, folder, TOPIC)
        (self.project / '.git').rmdir()
        manifest['source_mode'] = 'screenshots'
        (folder / 'manifest.json').write_text(batch.dump_json(manifest))
        with self.assertRaisesRegex(ValueError, 'media package'):
            deliver.deliver(self.project, folder, TOPIC)
        self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
