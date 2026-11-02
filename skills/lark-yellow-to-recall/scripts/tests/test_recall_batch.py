import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'recall_batch.py'
SPEC = importlib.util.spec_from_file_location('recall_batch', SCRIPT)
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
URL = 'https://example.larkoffice.com/wiki/wikiToken'


def yellow(text):
    return f'<span background-color="{batch.YELLOW}">{text}</span>'


def payload(body=None):
    if body is None:
        body = '<h2 id="q">Q1：' + yellow('原问题？') + '</h2><p id="a">' + yellow('答：原答案。') + '</p>'
    return {'ok': True, 'data': {'document': {'document_id': 'docTest', 'revision_id': 1,
                                             'content': '<title id="docTest">示例</title>' + body}}}


def plan():
    return {'hierarchy_confirmed': True, 'allowed_paths': [['卡组', '子组']], 'import_parent': None,
            'source_document_id': 'docTest', 'source_url': URL, 'revision': 1,
            'cards': [{'path': ['卡组', '子组'], 'front': '原问题？', 'question_origin': 'extracted',
                       'refs': [{'block_key': 'a', 'run_index': 0}]}]}


def build(source=None, draft=None, history=None, include=False):
    return batch.build_cards(batch.extract_source(source or payload(), URL), draft or plan(), history or {}, include)


class ExtractionTests(unittest.TestCase):
    def test_adjacent_bold_and_spans_merge(self):
        source = payload('<p id="a"><b>' + yellow('答：') + '</b>' + yellow('正文') + '</p>')
        result = batch.extract_source(source, URL)
        self.assertEqual([item['text'] for item in result['highlights']], ['答：正文'])

    def test_unhighlighted_gap_separates_regions(self):
        result = batch.extract_source(payload('<p id="a">' + yellow('前') + '未标黄' + yellow('后') + '</p>'), URL)
        self.assertEqual([item['text'] for item in result['highlights']], ['前', '后'])

    def test_breaks_preserved(self):
        result = batch.extract_source(payload('<p id="a">' + yellow('前<br/>后') + '</p>'), URL)
        self.assertEqual(result['highlights'][0]['text'], '前\n后')

    def test_nested_lists_not_double_counted(self):
        body = '<ul><li id="outer">' + yellow('一') + '<ul><li id="inner">' + yellow('二') + '</li></ul></li></ul>'
        result = batch.extract_source(payload(body), URL)
        self.assertEqual([(item['block_key'], item['text']) for item in result['highlights']], [('outer', '一'), ('inner', '二')])

    def test_table_context_keeps_headers_out_of_highlights(self):
        body = '<table id="table"><thead><tr><th id="header">口径</th></tr></thead><tbody><tr><td><p id="cell">' + yellow('84%') + '</p></td></tr></tbody></table>'
        result = batch.extract_source(payload(body), URL)
        self.assertEqual(result['blocks']['cell']['table_context'], {'table_key': 'table', 'row': 1, 'column': 0, 'headers': ['口径']})
        self.assertEqual([item['text'] for item in result['highlights']], ['84%'])

    def test_code_highlights_preserved(self):
        result = batch.extract_source(payload('<pre id="code"><code>' + yellow('a &lt; b<br/>next') + '</code></pre>'), URL)
        self.assertEqual(result['highlights'][0]['text'], 'a < b\nnext')

    def test_container_background_and_yellow_font_ignored(self):
        body = f'<callout background-color="{batch.YELLOW}"><p id="a">容器</p></callout><p id="b"><span color="{batch.YELLOW}">字体</span></p>'
        self.assertEqual(batch.extract_source(payload(body), URL)['highlights'], [])

    def test_missing_id_and_unsupported_span_reported(self):
        result = batch.extract_source(payload('<p>' + yellow('缺少ID') + '</p>' + yellow('无块容器')), URL)
        self.assertEqual({item['type'] for item in result['unsupported']}, {'missing_block_id', 'unsupported_highlight'})

    def test_duplicate_block_ids_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            batch.extract_source(payload('<p id="a">一</p><p id="a">二</p>'), URL)

    def test_docx_alias_uses_real_document_id(self):
        wiki = batch.extract_source(payload(), URL)
        docx = batch.extract_source(payload(), 'https://example.larkoffice.com/docx/docTest')
        self.assertEqual(wiki['canonical_url'], docx['canonical_url'])
        with self.assertRaisesRegex(ValueError, 'mismatch'):
            batch.extract_source(payload(), 'https://example.larkoffice.com/docx/wrong')

    def test_failed_or_truncated_fetch_rejected(self):
        with self.assertRaisesRegex(ValueError, 'succeed'):
            batch.extract_source({'ok': False}, URL)
        source = payload()
        source['data']['document']['tips'] = '正文被截断'
        with self.assertRaisesRegex(ValueError, 'truncation'):
            batch.extract_source(source, URL)

    def test_entity_declaration_rejected(self):
        source = payload('<!DOCTYPE document><p id="a">text</p>')
        with self.assertRaisesRegex(ValueError, 'entities'):
            batch.extract_source(source, URL)

    def test_selection_must_not_expand(self):
        selected = URL + '#share-selection'
        with self.assertRaisesRegex(ValueError, 'full-document'):
            batch.extract_source(payload(), selected)
        fragment = payload('<fragment><p id="a">' + yellow('选区') + '</p></fragment>')
        with self.assertRaisesRegex(ValueError, 'user-selected'):
            batch.extract_source(fragment, URL)
        self.assertEqual(batch.extract_source(fragment, selected)['scope'], 'selection')


class PlanTests(unittest.TestCase):
    def test_answers_only_from_refs_and_labels_removed(self):
        cards, skipped, unresolved, coverage = build()
        self.assertEqual(cards[0]['back'], '原答案。')
        self.assertEqual(len(coverage), 2)
        self.assertFalse(skipped or unresolved)

    def test_confirmation_paths_and_revision_required(self):
        for field, value in [('hierarchy_confirmed', False), ('allowed_paths', [['其它']]), ('revision', 2), ('source_document_id', 'wrong')]:
            draft = plan()
            draft[field] = value
            with self.assertRaises(ValueError):
                build(draft=draft)

    def test_free_answer_and_modified_extracted_question_rejected(self):
        draft = plan()
        draft['cards'][0]['back'] = '添加事实'
        with self.assertRaisesRegex(ValueError, 'answers must come from refs'):
            build(draft=draft)
        draft = plan()
        draft['cards'][0]['front'] = '收窄的问题？'
        with self.assertRaisesRegex(ValueError, 'mark it inferred'):
            build(draft=draft)
        draft['cards'][0]['question_origin'] = 'inferred'
        with self.assertRaisesRegex(ValueError, 'question_note'):
            build(draft=draft)
        draft['cards'][0]['question_note'] = '限定原文口径'
        self.assertEqual(build(draft=draft)[0][0]['front'], '收窄的问题？')

    def test_unknown_or_duplicate_refs_rejected(self):
        draft = plan()
        draft['cards'][0]['refs'][0]['run_index'] = 1
        with self.assertRaisesRegex(ValueError, 'Unknown'):
            build(draft=draft)
        draft = plan()
        draft['cards'].append(copy.deepcopy(draft['cards'][0]))
        with self.assertRaisesRegex(ValueError, 'more than once'):
            build(draft=draft)

    def test_all_highlights_accounted_including_question_only(self):
        source = payload()
        source['data']['document']['content'] += '<h2 id="onlyq">' + yellow('Q2：没有答案？') + '</h2>'
        with self.assertRaisesRegex(ValueError, 'Unaccounted'):
            build(source=source)
        draft = plan()
        draft['unresolved'] = [{'reason': '只有问题被标黄', 'refs': [{'block_key': 'onlyq', 'run_index': 0}]}]
        self.assertEqual(len(build(source=source, draft=draft)[2]), 1)

    def test_unconfirmed_resources_and_unsupported_highlights_block_archive(self):
        source = payload()
        source['data']['document']['content'] += '<whiteboard token="board"/>'
        with self.assertRaisesRegex(ValueError, 'embedded resources'):
            build(source=source)
        draft = plan()
        draft['resource_decisions'] = [{'key': 'board', 'reason': '已读取，属于未标黄架构图，不制卡'}]
        self.assertEqual(len(build(source=source, draft=draft)[0]), 1)

    def test_repeated_archived_card_skipped_and_full_revision_optional(self):
        old = build()[0][0]
        history = {old['id']: old}
        cards, skipped, _, _ = build(history=history)
        self.assertEqual(cards, [])
        self.assertEqual(skipped[0]['id'], old['id'])
        self.assertEqual(build(history=history, include=True)[0][0]['id'], old['id'])

    def test_question_and_highlight_changes_reuse_id(self):
        old = build()[0][0]
        source = payload()
        source['data']['document']['content'] = source['data']['document']['content'].replace('原答案。', '更新答案。')
        draft = plan()
        draft['cards'][0].update(front='限定范围的问题？', question_origin='inferred', question_note='限定范围')
        new = build(source=source, draft=draft, history={old['id']: old})[0][0]
        self.assertEqual(new['id'], old['id'])
        self.assertTrue(new['change_candidate'])

    def test_run_index_shift_reuses_same_block_id(self):
        old = build()[0][0]
        source = payload()
        source['data']['document']['content'] = source['data']['document']['content'].replace(yellow('答：原答案。'), yellow('新区域') + '间隔' + yellow('答：原答案。'))
        draft = plan()
        draft['cards'][0]['refs'][0]['run_index'] = 1
        draft['unresolved'] = [{'reason': '新增片段待确认', 'refs': [{'block_key': 'a', 'run_index': 0}]}]
        self.assertEqual(build(source=source, draft=draft, history={old['id']: old}, include=True)[0][0]['id'], old['id'])

    def test_ambiguous_reuse_needs_explicit_identity(self):
        old = build()[0][0]
        other = {**old, 'id': 'other'}
        history = {old['id']: old, other['id']: other}
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            build(history=history)
        draft = plan()
        draft['cards'][0].update(existing_id=old['id'], identity_note='确认属于原卡')
        self.assertEqual(build(draft=draft, history=history, include=True)[0][0]['id'], old['id'])

    def test_parent_change_is_a_change_candidate(self):
        old = build()[0][0]
        draft = plan()
        draft['import_parent'] = ['父卡组']
        new = build(draft=draft, history={old['id']: old})[0][0]
        self.assertTrue(new['change_candidate'])

    def test_replaced_locator_needs_confirmation(self):
        old = build()[0][0]
        source = payload()
        source['data']['document']['content'] = source['data']['document']['content'].replace('id="a"', 'id="newblock"')
        draft = plan()
        draft['cards'][0]['refs'][0]['block_key'] = 'newblock'
        with self.assertRaisesRegex(ValueError, 'changed locator'):
            build(source=source, draft=draft, history={old['id']: old})
        draft['cards'][0].update(existing_id=old['id'], identity_note='确认源块被替换，仍为同一知识单元')
        self.assertEqual(build(source=source, draft=draft, history={old['id']: old}, include=True)[0][0]['id'], old['id'])

    def test_stable_unit_keys_disambiguate_same_block(self):
        source = payload('<p id="a">' + yellow('甲') + '未标黄' + yellow('乙') + '</p>')
        draft = plan()
        draft['cards'] = [{'path': ['卡组', '子组'], 'front': word + '是什么？', 'question_origin': 'inferred',
                           'question_note': '描述反推', 'unit_key': word, 'refs': [{'block_key': 'a', 'run_index': index}]}
                          for index, word in enumerate(['甲', '乙'])]
        old_cards = build(source=source, draft=draft)[0]
        self.assertNotEqual(old_cards[0]['id'], old_cards[1]['id'])
        history = {card['id']: card for card in old_cards}
        self.assertEqual([card['id'] for card in build(source=source, draft=draft, history=history, include=True)[0]],
                         [card['id'] for card in old_cards])


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.project = Path(self.temporary.name)
        (self.project / 'src/lib').mkdir(parents=True)
        (self.project / 'src/lib/memory-markdown.ts').write_text('export {};')
        self.config = batch.configure(self.project, 'src/lib/memory-markdown.ts', 'Asia/Shanghai')

    def tearDown(self):
        self.temporary.cleanup()

    def test_configuration_idempotent_but_changes_refused(self):
        self.assertEqual(batch.configure(self.project, 'src/lib/memory-markdown.ts', 'Asia/Shanghai'), self.config)
        with self.assertRaisesRegex(ValueError, 'differs'):
            batch.configure(self.project, 'src/lib/memory-markdown.ts', 'UTC')

    def test_failed_verifier_does_not_publish_batch(self):
        with patch.object(batch, 'verify_batch', side_effect=ValueError('incompatible parser')):
            with self.assertRaisesRegex(ValueError, 'incompatible'):
                batch.create_archive(self.project, self.config, batch.extract_source(payload(), URL), plan())
        self.assertEqual(list((self.project / 'card-imports/batches').iterdir()), [])

    def test_immutable_batches_index_and_no_empty_duplicate_batch(self):
        with patch.object(batch, 'verify_batch', return_value={'status': 'passed', 'database_accessed': False}):
            first = batch.create_archive(self.project, self.config, batch.extract_source(payload(), URL), plan())
            folder = Path(first['batch_directory'])
            original = {path.name: path.read_bytes() for path in folder.iterdir()}
            repeat = batch.create_archive(self.project, self.config, batch.extract_source(payload(), URL), plan())
            self.assertEqual(repeat['status'], 'no_changes')
            self.assertEqual(len(list(folder.parent.iterdir())), 1)
            revised = batch.create_archive(self.project, self.config, batch.extract_source(payload(), URL), plan(), True)
            self.assertNotEqual(first['batch_directory'], revised['batch_directory'])
            self.assertEqual(original, {path.name: path.read_bytes() for path in folder.iterdir()})
            manifest = batch.read_json(folder / 'manifest.json')
            self.assertTrue(manifest['created_at'].endswith('+08:00'))
            self.assertNotIn('importedAt', Path(first['files'][0]).read_text())
            batch.rebuild_index(self.project)
            index = (self.project / 'card-imports/index.md').read_text()
            self.assertIn(manifest['batch'], index)
            self.assertNotIn('原答案。', index)
            package = folder / 'derived.recall-media.json'
            package.write_text('{"format":"recall-media"}')
            batch.rebuild_index(self.project)
            self.assertIn('带图包：[derived.recall-media.json]', (self.project / 'card-imports/index.md').read_text())
            self.assertEqual(manifest, batch.read_json(folder / 'manifest.json'))

    def test_folder_symlinks_and_escaping_files_rejected(self):
        root = self.project / 'card-imports'
        (root / 'batches').symlink_to(self.project / 'src', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            batch.archive_root(self.project)

    def test_serialization_reemits_heading_when_ascending(self):
        card = build()[0][0]
        text = batch.serialize_cards([card, {**card, 'id': 'second', 'path': ['卡组']}])
        self.assertEqual(text.count('# 卡组\n'), 2)
        self.assertIn('<!-- recall:end -->\n\n\n# 卡组', text)

    def test_large_batch_split_and_utf16_limits(self):
        card = build()[0][0]
        cards = [{**card, 'id': f'card-{index}'} for index in range(1001)]
        self.assertEqual([len(part) for part in batch.split_cards(cards)], [1000, 1])
        self.assertEqual(batch.utf16_length('😀'), 2)

    def test_modified_archived_markdown_fails_checksum(self):
        card = build()[0][0]
        folder = self.project / 'fixture'
        folder.mkdir()
        text = batch.serialize_cards([card])
        (folder / 'cards.md').write_text(text + '\n')
        manifest = {'card_count': 1, 'cards': [card], 'files': [{'name': 'cards.md', 'card_count': 1,
                     'sha256': batch.hashlib.sha256(text.encode()).hexdigest()}]}
        with self.assertRaisesRegex(ValueError, 'checksum'):
            batch.batch_documents(folder, manifest)


if __name__ == '__main__':
    unittest.main()
