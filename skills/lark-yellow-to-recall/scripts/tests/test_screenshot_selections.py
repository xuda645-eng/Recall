import base64
import copy
import hashlib
import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / 'recall_batch.py'
SPEC = importlib.util.spec_from_file_location('recall_screenshots', SCRIPT)
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
URL = 'https://example.larkoffice.com/wiki/learningWiki'
PROJECT = Path(os.environ.get('RECALL_PROJECT', Path(__file__).resolve().parents[4])).resolve()
AVAILABLE = shutil.which('node') and (PROJECT / 'node_modules/vite/dist/node/index.js').is_file()
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=')


def source(reverse=False):
    cells = ['<td><img id="imageA" src="mediaA"/></td>', '<td><img id="imageB" token="mediaB"/></td>']
    if reverse:
        cells.reverse()
    return {'ok': True, 'data': {'document': {'document_id': 'learningDoc', 'revision_id': 16,
            'content': '<title id="learningDoc">Learning notes</title><p id="outside">Outside context</p>'
                       '<table id="tableA"><tbody><tr>' + ''.join(cells) + '<td><p id="empty"/></td></tr>'
                       '<tr><td><p id="blank"/></td></tr></tbody></table>'}}}


def selections():
    return {'source_document_id': 'learningDoc', 'revision': 16, 'images': [
        {'block_key': 'imageA', 'file': 'image.png', 'sha256': hashlib.sha256(PNG).hexdigest(),
         'decision': 'selected', 'regions': [{'key': 'focus', 'bounds': [0.1, 0.2, 0.9, 0.7], 'verified': True,
             'context': 'Outside heading is context only', 'segments': [
                 {'key': 'goal', 'text': 'Selected original text.', 'representation': 'text'},
                 {'key': 'milestone', 'text': 'Node A points to planned milestone B.', 'representation': 'diagram'}]}]},
        {'block_key': 'imageB', 'file': 'image.png', 'sha256': hashlib.sha256(PNG).hexdigest(),
         'decision': 'unresolved', 'reason': 'Date unreadable; request a clearer image.'}]}


def plan():
    return {'hierarchy_confirmed': True, 'allowed_paths': [['Learning']], 'import_parent': None,
            'source_document_id': 'learningDoc', 'source_url': URL, 'revision': 16,
            'cards': [{'path': ['Learning'], 'front': 'What is the selected goal?', 'question_origin': 'inferred',
                       'question_note': 'Narrowed to reviewed screenshot text.',
                       'refs': [{'block_key': 'imageA:focus:goal', 'run_index': 0}]},
                      {'path': ['Learning'], 'front': 'What is the diagram milestone?', 'question_origin': 'inferred',
                       'question_note': 'Diagram relationship visually reviewed.',
                       'refs': [{'block_key': 'imageA:focus:milestone', 'run_index': 0}]}],
            'resource_decisions': [{'key': 'imageA', 'reason': 'Red frame visually reviewed.'},
                                   {'key': 'imageB', 'reason': 'Unreadable date, not used as an answer.'}]}


class ScreenshotTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        (self.directory / 'image.png').write_bytes(PNG)
        self.selection_path = self.directory / 'selections.json'

    def tearDown(self):
        self.temporary.cleanup()

    def extract(self, annotation=None, payload=None):
        self.selection_path.write_text(json.dumps(annotation or selections()))
        return batch.extract_screenshots(payload or source(), URL, self.selection_path)

    def test_inventory_preserves_table_order_and_empty_cells(self):
        extraction = batch.extract_screenshots(source(), URL)
        self.assertEqual([image['block_key'] for image in extraction['images']], ['imageA', 'imageB'])
        self.assertEqual(extraction['images'][1]['table_context'], {'table_key': 'tableA', 'row': 1, 'column': 2})
        self.assertEqual(len(extraction['unsupported']), 2)
        self.assertFalse(extraction['highlights'])

    def test_image_token_and_block_id_are_required(self):
        payload = source()
        payload['data']['document']['content'] = '<img id="imageA"/>'
        with self.assertRaisesRegex(ValueError, 'media token'):
            batch.extract_screenshots(payload, URL)

    def test_source_version_and_complete_inventory_are_required(self):
        for field, value in [('revision', 17), ('source_document_id', 'wrong'), ('images', selections()['images'][:1])]:
            annotation = selections()
            annotation[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.extract(annotation)

    def test_duplicate_decisions_are_rejected(self):
        annotation = selections()
        annotation['images'].append(copy.deepcopy(annotation['images'][0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate image'):
            self.extract(annotation)

    def test_checksum_and_visual_review_are_required(self):
        annotation = selections()
        annotation['images'][0]['sha256'] = 'wrong'
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.extract(annotation)
        annotation = selections()
        annotation['images'][0]['regions'][0]['verified'] = False
        with self.assertRaisesRegex(ValueError, 'Visually verify'):
            self.extract(annotation)

    def test_image_paths_cannot_escape_the_evidence_directory(self):
        annotation = selections()
        annotation['images'][0]['file'] = str(self.directory / 'image.png')
        with self.assertRaisesRegex(ValueError, 'relative'):
            self.extract(annotation)
        with tempfile.TemporaryDirectory() as other:
            (self.directory / 'linked.png').symlink_to(Path(other) / 'image.png')
            (Path(other) / 'image.png').write_bytes(PNG)
            annotation['images'][0]['file'] = 'linked.png'
            with self.assertRaisesRegex(ValueError, 'escapes'):
                self.extract(annotation)

    def test_bounds_are_normalized_and_ordered(self):
        for bounds in [[0, 0, 2, 1], [0.8, 0.1, 0.2, 0.9], [True, 0, 1, 1], [0, 0, float('nan'), 1]]:
            annotation = selections()
            annotation['images'][0]['regions'][0]['bounds'] = bounds
            with self.subTest(bounds=bounds), self.assertRaisesRegex(ValueError, 'bounds'):
                self.extract(annotation)

    def test_context_does_not_enter_answers_and_diagram_evidence_is_retained(self):
        extraction = self.extract()
        cards, _, _, coverage = batch.build_cards(extraction, plan(), {})
        self.assertEqual(cards[0]['back'], 'Selected original text.')
        self.assertNotIn('Outside', cards[0]['back'])
        self.assertEqual(cards[1]['evidence'][0]['screenshot']['representation'], 'diagram')
        self.assertEqual(len(coverage), 2)
        self.assertNotIn('file', extraction['image_decisions'][0])

    def test_table_movement_preserves_identity_and_repeat_detection(self):
        cards, _, _, _ = batch.build_cards(self.extract(), plan(), {})
        history = {card['id']: card for card in cards}
        moved = self.extract(payload=source(reverse=True))
        changed, skipped, _, _ = batch.build_cards(moved, plan(), history)
        self.assertFalse(changed)
        self.assertEqual([item['id'] for item in skipped], [card['id'] for card in cards])
        self.assertEqual(moved['highlights'][0]['screenshot']['table_context']['column'], 2)

    def test_unselected_images_cannot_supply_regions(self):
        annotation = selections()
        annotation['images'][0]['decision'] = 'context'
        annotation['images'][0]['reason'] = 'No user red frame.'
        with self.assertRaisesRegex(ValueError, 'cannot provide'):
            self.extract(annotation)

    def test_duplicate_units_and_unused_segments_are_rejected(self):
        annotation = selections()
        segments = annotation['images'][0]['regions'][0]['segments']
        segments.append(copy.deepcopy(segments[0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate screenshot'):
            self.extract(annotation)
        draft = plan()
        draft['cards'].pop()
        with self.assertRaisesRegex(ValueError, 'Unaccounted'):
            batch.build_cards(self.extract(), draft, {})

    def test_modes_cannot_silently_mix(self):
        with self.assertRaisesRegex(ValueError, 'yellow colors'):
            batch.extract_for_mode(source(), URL, 'screenshots', [batch.YELLOW])
        with self.assertRaisesRegex(ValueError, '--mode screenshots'):
            batch.extract_for_mode(source(), URL, 'yellow', selections_path=self.selection_path)

    @unittest.skipUnless(AVAILABLE, 'Actual Recall parser dependencies required')
    def test_actual_parser_archive_repeat_and_evidence_roundtrip(self):
        project = self.directory / 'project'
        shutil.copytree(PROJECT / 'src', project / 'src')
        (project / 'node_modules').symlink_to(PROJECT / 'node_modules', target_is_directory=True)
        config = batch.configure(project, 'src/lib/memory-markdown.ts', 'Asia/Shanghai')
        result = batch.create_archive(project, config, self.extract(), plan())
        self.assertEqual(result['card_count'], 2)
        self.assertTrue(result['validation']['review_progress_preserved'])
        manifest = json.loads((Path(result['batch_directory']) / 'manifest.json').read_text())
        self.assertEqual(manifest['source_mode'], 'screenshots')
        self.assertEqual(manifest['image_decisions'][1]['decision'], 'unresolved')
        self.assertEqual(manifest['cards'][0]['evidence'][0]['screenshot']['sha256'], hashlib.sha256(PNG).hexdigest())
        self.assertNotIn(str(self.directory), json.dumps(manifest))
        repeated = batch.create_archive(project, config, self.extract(), plan())
        self.assertEqual(repeated['status'], 'no_changes')
        revised = selections()
        revised['images'][0]['regions'][0]['segments'][1]['text'] = 'Node A points to revised planned milestone C.'
        updated = batch.create_archive(project, config, self.extract(revised), plan())
        self.assertEqual(updated['card_count'], 1)
        self.assertEqual(updated['validation']['against_history']['changes'], 1)
        self.assertEqual(updated['validation']['against_history']['updated'], 0)
        self.assertEqual(updated['validation']['confirmed_history_updates']['updated'], 1)
        self.assertTrue(updated['validation']['old_cards_preserved'])


if __name__ == '__main__':
    unittest.main()
