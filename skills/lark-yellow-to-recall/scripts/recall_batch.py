import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


YELLOW = 'rgba(255,246,122,0.8)'
TEXT_BLOCKS = {'title', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'td', 'th'}
RESOURCE_TAGS = {'img', 'whiteboard', 'sheet', 'bitable', 'synced_reference', 'vc-transcribe-tab'}
MAX_BYTES = 5 * 1024 * 1024


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def dump_json(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def exclusive_json(path, value):
    with Path(path).open('x', encoding='utf-8') as handle:
        handle.write(dump_json(value))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def utf16_length(text):
    return len(text.encode('utf-16-le')) // 2


def source_token(url):
    match = re.search(r'/docx/([A-Za-z0-9]+)', url)
    return match[1] if match else None


def ref_key(ref):
    require(isinstance(ref, dict) and set(ref) == {'block_key', 'run_index'}, 'refs only accept block_key and run_index')
    require(isinstance(ref['block_key'], str) and type(ref['run_index']) is int and ref['run_index'] >= 0, 'Invalid highlight ref')
    return ref['block_key'], ref['run_index']


def normalized_question(text):
    return re.sub(r'^Q\d+[：:]\s*', '', text).strip()


def text_chunks(element, colors, highlighted=False):
    highlighted = highlighted or (element.tag == 'span' and element.get('background-color') in colors)
    if element.text:
        yield highlighted, element.text
    for child in element:
        if child.tag in TEXT_BLOCKS:
            yield False, '\n'
        elif child.tag == 'br':
            yield highlighted, '\n'
        else:
            yield from text_chunks(child, colors, highlighted)
        if child.tail:
            yield highlighted, child.tail


def extract_source(payload, requested_url, colors=None):
    require(payload.get('ok') is True, 'Source fetch did not succeed')
    document = payload.get('data', {}).get('document', {})
    require(isinstance(document, dict), 'Missing source document')
    document_id, content = document.get('document_id'), document.get('content')
    require(isinstance(document_id, str) and re.fullmatch(r'[A-Za-z0-9]+', document_id), 'Missing real document_id')
    require(isinstance(content, str) and content.strip().startswith('<'), 'XML/full source response required')
    require(document.get('revision_id') is not None, 'Missing source revision')
    parsed_url = urlsplit(requested_url)
    require(parsed_url.scheme == 'https' and parsed_url.hostname and not parsed_url.username and not parsed_url.password,
            'Source URL must be HTTPS without credentials')
    require('/wiki/' in parsed_url.path or '/docx/' in parsed_url.path, 'Source URL must identify a Doc/Wiki')
    require(not source_token(requested_url) or source_token(requested_url) == document_id, 'Source URL document_id mismatch')
    require(not document.get('has_more') and not document.get('truncated'), 'Source must be fully read')
    tips = json.dumps(document.get('tips', ''), ensure_ascii=False)
    require(not re.search(r'truncat|截断', tips, re.I), 'Resolve source truncation before extraction')
    require(not re.search(r'<!DOCTYPE|<!ENTITY', content, re.I), 'XML entities are not supported')
    root = ET.fromstring('<document>' + content + '</document>')
    fragments = list(root.iter('fragment'))
    require(not fragments or parsed_url.fragment, 'A fragment requires the user-selected URL')
    require(not parsed_url.fragment or fragments, 'A selected URL must not be replaced with a full-document read')
    colors = set(colors or [YELLOW])
    parents = {child: parent for parent in root.iter() for child in parent}
    highlights, blocks, resources, unsupported = [], {}, [], []
    headings = []
    question = None
    title = next((''.join(element.itertext()).strip() for element in root.iter('title')), document_id)
    known_spans = set()
    for position, element in enumerate(root.iter()):
        if element.tag in RESOURCE_TAGS:
            resources.append({'key': element.get('id') or element.get('token') or f'{element.tag}:{position}', 'type': element.tag})
        heading_match = re.fullmatch(r'h([1-6])', element.tag)
        text = ''.join(part for _, part in text_chunks(element, colors)) if element.tag in TEXT_BLOCKS else ''
        block_key = element.get('id')
        if heading_match:
            level = int(heading_match[1])
            headings = [heading for heading in headings if heading['level'] < level]
            headings.append({'level': level, 'block_key': block_key, 'text': text})
            if question and level <= question['level']:
                question = None
            if re.match(r'^Q\d+[：:]', text):
                question = {'block_key': block_key, 'text': text, 'level': level}
        if element.tag not in TEXT_BLOCKS:
            continue
        if block_key:
            require(block_key not in blocks, 'Duplicate source block ID')
            block = {'block_key': block_key, 'tag': element.tag, 'text': text, 'question': question,
                     'headings': list(headings)}
            cell = element
            while cell in parents and cell.tag not in {'td', 'th'}:
                cell = parents[cell]
            if cell.tag in {'td', 'th'} and cell in parents:
                row = parents[cell]
                cells = [child for child in row if child.tag in {'td', 'th'}]
                table = row
                while table in parents and table.tag != 'table':
                    table = parents[table]
                rows = list(table.iter('tr'))
                block['table_context'] = {'table_key': table.get('id'), 'row': rows.index(row),
                                          'column': cells.index(cell),
                                          'headers': [''.join(header.itertext()) for header in table.iter('th')]}
            blocks[block_key] = block
        runs, active = [], ''
        for highlighted, chunk in text_chunks(element, colors):
            if highlighted:
                active += chunk
            elif active:
                runs.append(active)
                active = ''
        if active:
            runs.append(active)
        if runs:
            for span in element.iter('span'):
                if span.get('background-color') in colors:
                    nearest = parents.get(span)
                    while nearest is not None and nearest.tag not in TEXT_BLOCKS:
                        nearest = parents.get(nearest)
                    if nearest is element:
                        known_spans.add(span)
            if not block_key:
                unsupported.append({'type': 'missing_block_id', 'tag': element.tag, 'text': '\n'.join(runs)})
                continue
            for run_index, run in enumerate(runs):
                highlights.append({'block_key': block_key, 'run_index': run_index, 'text': run,
                                   'question': question, 'headings': list(headings)})
    for span in root.iter('span'):
        if span.get('background-color') in colors and span not in known_spans:
            unsupported.append({'type': 'unsupported_highlight', 'text': ''.join(span.itertext())})
    return {'source_document_id': document_id, 'source_url': requested_url,
            'canonical_url': f'{parsed_url.scheme}://{parsed_url.netloc}/docx/{document_id}',
            'source_title': title, 'revision': document['revision_id'],
            'scope': 'selection' if fragments else 'document',
            'source_sha256': hashlib.sha256(content.encode()).hexdigest(), 'yellow_colors': sorted(colors),
            'highlights': highlights, 'blocks': blocks, 'resources': resources, 'unsupported': unsupported}


def extract_screenshots(payload, requested_url, selections_path=None):
    extraction = extract_source(payload, requested_url)
    extraction.update({'source_mode': 'screenshots', 'yellow_colors': [], 'highlights': [], 'unsupported': []})
    root = ET.fromstring('<document>' + payload['data']['document']['content'] + '</document>')
    parents = {child: parent for parent in root.iter() for child in parent}
    images = []
    for element in root.iter('img'):
        block_key, token = element.get('id'), element.get('src') or element.get('token')
        require(block_key and token, 'Screenshot images require a real block ID and media token')
        require(not any(image['block_key'] == block_key for image in images), 'Duplicate screenshot block ID')
        image = {'block_key': block_key, 'token': token, 'order': len(images) + 1}
        cell = element
        while cell in parents and cell.tag not in {'td', 'th'}:
            cell = parents[cell]
        if cell.tag in {'td', 'th'} and cell in parents:
            row = parents[cell]
            table = row
            while table in parents and table.tag != 'table':
                table = parents[table]
            image['table_context'] = {'table_key': table.get('id'), 'row': list(table.iter('tr')).index(row) + 1,
                                      'column': list(row).index(cell) + 1}
        images.append(image)
    extraction['images'] = images
    if selections_path is None:
        extraction['unsupported'] = [{'type': 'unreviewed_image', 'block_key': image['block_key']} for image in images]
        return extraction
    selections_path = Path(selections_path).resolve(strict=True)
    selections = read_json(selections_path)
    require(selections.get('source_document_id') == extraction['source_document_id'], 'Selections document_id mismatch')
    require(selections.get('revision') == extraction['revision'], 'Selections revision mismatch')
    decisions = selections.get('images')
    require(isinstance(decisions, list) and all(isinstance(item, dict) for item in decisions), 'Selections images must be a list')
    require(len({item.get('block_key') for item in decisions}) == len(decisions), 'Duplicate image decision')
    require({item.get('block_key') for item in decisions} == {image['block_key'] for image in images},
            'Review every source image; selections must match the image inventory')
    extraction['image_decisions'] = []
    seen_units = set()
    for image in images:
        item = next(item for item in decisions if item['block_key'] == image['block_key'])
        require(isinstance(item.get('file'), str) and not Path(item['file']).is_absolute(), 'Image file must be relative to selections')
        image_path = (selections_path.parent / item['file']).resolve(strict=True)
        require(image_path.is_relative_to(selections_path.parent), 'Image file escapes selections directory')
        image_bytes = image_path.read_bytes()
        require(image_bytes.startswith(b'\x89PNG\r\n\x1a\n') or image_bytes.startswith(b'\xff\xd8\xff')
                or image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP',
                'Screenshot evidence must be a PNG, JPEG or WebP image')
        digest = hashlib.sha256(image_bytes).hexdigest()
        require(item.get('sha256') == digest, 'Image checksum mismatch; review the actual image')
        decision = item.get('decision')
        require(decision in {'selected', 'context', 'unresolved'}, 'Invalid screenshot decision')
        record = {**image, 'sha256': digest, 'decision': decision}
        if decision != 'selected':
            require(not item.get('regions'), 'Unselected images cannot provide answer regions')
            require(isinstance(item.get('reason'), str) and item['reason'].strip(), 'Unselected images require a reason')
            record['reason'] = item['reason']
        else:
            regions = item.get('regions')
            require(isinstance(regions, list) and regions, 'Selected images require red-frame regions')
            seen_regions = set()
            record['regions'] = []
            for region in regions:
                require(isinstance(region, dict), 'Red-frame regions must be objects')
                region_key = region.get('key')
                require(isinstance(region_key, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', region_key),
                        'Red-frame key must be a stable ASCII identifier')
                require(region_key not in seen_regions, 'Duplicate red-frame key')
                seen_regions.add(region_key)
                require(region.get('verified') is True, 'Visually verify every red frame before using its text')
                bounds = region.get('bounds')
                require(isinstance(bounds, list) and len(bounds) == 4
                        and all(type(value) in {int, float} and 0 <= value <= 1 for value in bounds)
                        and bounds[0] < bounds[2] and bounds[1] < bounds[3], 'Invalid normalized red-frame bounds')
                context = region.get('context', '')
                require(isinstance(context, str), 'Screenshot context must be text')
                segments = region.get('segments')
                require(isinstance(segments, list) and segments, 'Red frames require independent text segments')
                record['regions'].append({'key': region_key, 'bounds': bounds, 'context': context, 'verified': True})
                for segment in segments:
                    require(isinstance(segment, dict), 'Screenshot segments must be objects')
                    segment_key = segment.get('key')
                    require(isinstance(segment_key, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', segment_key),
                            'Segment key must be a stable ASCII identifier')
                    block_key = f'{image["block_key"]}:{region_key}:{segment_key}'
                    require(block_key not in seen_units, 'Duplicate screenshot knowledge unit')
                    seen_units.add(block_key)
                    text = segment.get('text')
                    require(isinstance(text, str) and text.strip() == text and text and utf16_length(text) <= 20000,
                            'Screenshot segment must contain reviewed, bounded text')
                    representation = segment.get('representation', 'text')
                    require(representation in {'text', 'diagram'}, 'Invalid screenshot representation')
                    evidence = {**image, 'sha256': digest, 'region_key': region_key, 'segment_key': segment_key,
                                'bounds': bounds, 'context': context, 'representation': representation, 'verified': True}
                    extraction['highlights'].append({'block_key': block_key, 'run_index': 0, 'text': text,
                                                     'question': None, 'headings': [], 'screenshot': evidence})
                    require(block_key not in extraction['blocks'], 'Screenshot unit collides with a source block')
                    extraction['blocks'][block_key] = {'block_key': block_key, 'tag': 'screenshot', 'text': text,
                                                       'question': None, 'headings': [], 'screenshot': evidence}
        extraction['image_decisions'].append(record)
    return extraction


def extract_for_mode(payload, requested_url, mode, colors=None, selections_path=None):
    if mode == 'screenshots':
        require(not colors, 'Screenshot mode does not accept yellow colors')
        return extract_screenshots(payload, requested_url, selections_path)
    require(selections_path is None, 'Screenshot selections require --mode screenshots')
    return extract_source(payload, requested_url, colors)


def archive_root(project):
    root = project / 'card-imports'
    require(not root.is_symlink() and not (root / 'batches').is_symlink(), 'Archive directories must not be symlinks')
    return root


def configure(project, parser, timezone):
    project = Path(project).resolve(strict=True)
    parser_path = (project / parser).resolve(strict=True)
    require(parser_path.is_relative_to(project), 'Parser must belong to the project')
    ZoneInfo(timezone)
    config = {'version': 1, 'project_root': str(project), 'parser': str(parser_path.relative_to(project)), 'timezone': timezone}
    root = archive_root(project)
    root.mkdir(exist_ok=True)
    config_path = root / 'config.json'
    if config_path.exists():
        require(read_json(config_path) == config, 'Existing configuration differs; confirm and edit it explicitly')
    else:
        exclusive_json(config_path, config)
    return config


def load_config(project):
    project = Path(project).resolve(strict=True)
    config = read_json(archive_root(project) / 'config.json')
    require(config.get('project_root') == str(project), 'Configured project path changed; confirm configuration')
    parser = (project / config['parser']).resolve(strict=True)
    require(parser.is_relative_to(project), 'Parser must belong to the project')
    ZoneInfo(config['timezone'])
    return project, config


def history_manifests(project):
    root = archive_root(project) / 'batches'
    records = []
    for path in root.glob('*/manifest.json'):
        if path.parent.name.startswith('.'):
            continue
        require(not path.parent.is_symlink() and not path.is_symlink(), 'Historical archives must not be symlinks')
        manifest = read_json(path)
        records.append((path, manifest))
    return sorted(records, key=lambda record: (record[1].get('created_at', ''), record[1].get('batch', '')))


def source_history(project, document_id):
    latest = {}
    for _, manifest in history_manifests(project):
        token = manifest.get('source_document_id') or source_token(manifest.get('source_url', ''))
        if token == document_id:
            for card in manifest.get('cards', []):
                latest[card['id']] = {**card, 'import_parent': manifest.get('import_parent')}
    return latest


def validate_paths(paths):
    require(isinstance(paths, list) and paths, 'Confirmed allowed_paths are required')
    for path in paths:
        require(isinstance(path, list) and 1 <= len(path) <= 32, 'Invalid card-group path')
        require(all(isinstance(name, str) and name.strip() == name and name and '\n' not in name and '\r' not in name
                    and utf16_length(name) <= 80 for name in path), 'Invalid card-group name')


def build_cards(extraction, plan, history, include_unchanged=False):
    require(plan.get('hierarchy_confirmed') is True, 'Confirm the hierarchy before archiving')
    validate_paths(plan.get('allowed_paths'))
    parent = plan.get('import_parent')
    if parent is not None:
        validate_paths([parent])
    require(plan.get('source_document_id') == extraction['source_document_id'], 'Plan document_id mismatch')
    require(plan.get('revision') == extraction['revision'], 'Plan revision mismatch')
    require(not extraction['unsupported'], 'Resolve unsupported highlights before archiving')
    resource_decisions = {item['key']: item['reason'] for item in plan.get('resource_decisions', []) if item.get('reason')}
    require(all(item['key'] in resource_decisions for item in extraction['resources']), 'Resolve embedded resources before archiving')
    regions = {(item['block_key'], item['run_index']): item for item in extraction['highlights']}
    usage, cards, skipped, seen_ids, used_questions = {}, [], [], set(), set()
    require(isinstance(plan.get('cards'), list) and plan['cards'], 'No planned cards; do not create an empty template')

    def use(refs, role, owner):
        require(isinstance(refs, list) and refs, 'At least one highlight ref is required')
        evidence = []
        for ref in refs:
            key = ref_key(ref)
            require(key in regions, f'Unknown highlight ref: {key}')
            require(key not in usage, f'Highlight ref used more than once: {key}')
            usage[key] = {'role': role, 'owner': owner}
            entry = {**ref, 'text': regions[key]['text']}
            if 'screenshot' in regions[key]:
                entry['screenshot'] = regions[key]['screenshot']
            evidence.append(entry)
        return evidence

    for item in plan['cards']:
        require(set(item) <= {'path', 'front', 'question_origin', 'question_note', 'refs', 'existing_id', 'identity_note',
                              'unit_key', 'context_blocks'}, 'Unexpected card fields; answers must come from refs')
        require(item.get('path') in plan['allowed_paths'], 'Card path is not confirmed')
        front, origin = item.get('front'), item.get('question_origin')
        require(isinstance(front, str) and front.strip() == front and front and '\n' not in front and '\r' not in front
                and utf16_length(front) <= 10000, 'Invalid question')
        require(origin in {'extracted', 'inferred'}, 'Invalid question_origin')
        evidence = use(item.get('refs'), 'answer', front)
        back = '\n\n'.join(re.sub(r'^(?:答|背诵句)[：:]\s*', '', entry['text']).strip() for entry in evidence)
        require(back and utf16_length(back) <= 20000, 'Empty or oversized answer')
        question_keys = {regions[ref_key(ref)]['question']['block_key'] for ref in item['refs'] if regions[ref_key(ref)]['question']}
        used_questions.update(question_keys)
        if origin == 'extracted':
            require(len(question_keys) == 1, 'Extracted question must belong to one source question')
            require(front == normalized_question(extraction['blocks'][next(iter(question_keys))]['text']),
                    'Question was changed; mark it inferred with a reason')
        else:
            require(isinstance(item.get('question_note'), str) and item['question_note'].strip(), 'Inferred question requires question_note')
        block_keys = {entry['block_key'] for entry in evidence}
        exact_refs = {(entry['block_key'], entry['run_index']) for entry in evidence}
        relevant = list(history.values())
        if item.get('unit_key'):
            require(isinstance(item['unit_key'], str) and item['unit_key'].strip(), 'unit_key must be a stable string')
            relevant = [old for old in relevant if old.get('unit_key', '') == item['unit_key']]
        exact = [old for old in relevant if {(entry['block_key'], entry['run_index']) for entry in old['evidence']} == exact_refs]
        candidates = exact or [old for old in relevant if {entry['block_key'] for entry in old['evidence']} & block_keys]
        existing_id = item.get('existing_id')
        if existing_id:
            require(existing_id in history, 'existing_id must identify a same-source historical card')
            require(item.get('identity_note'), 'Explicit identity reuse requires identity_note')
            old = history[existing_id]
        else:
            require(len(candidates) <= 1, 'Ambiguous historical identity; confirm existing_id and identity_note')
            require(candidates or not any(old['front'] == front and old['path'] == item['path'] for old in history.values()),
                    'Historical question has a changed locator; confirm existing_id and identity_note')
            old = candidates[0] if candidates else None
        identity = [extraction['source_document_id'], evidence[0]['block_key'], item.get('unit_key', '')]
        card_id = old['id'] if old else 'lyr-' + hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()[:24]
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,127}', card_id) and card_id not in seen_ids,
                'Duplicate card identity; distinguish independent units or confirm the mapping')
        seen_ids.add(card_id)
        context = []
        for block_key in item.get('context_blocks', []):
            require(block_key in extraction['blocks'], 'Unknown context block')
            context.append(extraction['blocks'][block_key])
        card = {'id': card_id, 'source_identity': json.dumps(identity, ensure_ascii=False), 'path': item['path'],
                'front': front, 'back': back, 'question_origin': origin, 'question_note': item.get('question_note', ''),
                'identity_note': item.get('identity_note', ''), 'unit_key': item.get('unit_key', ''), 'evidence': evidence, 'context': context,
                'change_candidate': bool(old and any(old[field] != value for field, value in
                                                    [('path', item['path']), ('front', front), ('back', back)])
                                         or old and old.get('import_parent') != parent)}
        identical = old and not card['change_candidate']
        if identical and not include_unchanged:
            skipped.append({'id': card_id, 'reason': 'Identical to latest archived card; archive status is not proof of APP import'})
        else:
            cards.append(card)

    for ref in plan.get('context_refs', []):
        use([ref], 'context', 'explicit')
    unresolved = []
    for item in plan.get('unresolved', []):
        require(isinstance(item.get('reason'), str) and item['reason'].strip(), 'Unresolved highlights need a reason')
        evidence = use(item.get('refs'), 'unresolved', item['reason'])
        unresolved.append({'reason': item['reason'], 'refs': item['refs'], 'text': '\n\n'.join(entry['text'] for entry in evidence)})
    for key, region in regions.items():
        if key not in usage and region['block_key'] in used_questions:
            usage[key] = {'role': 'question_context', 'owner': region['block_key']}
    require(set(usage) == set(regions), 'Unaccounted highlights: ' + repr(sorted(set(regions) - set(usage))))
    coverage = [{ 'block_key': key[0], 'run_index': key[1], **value} for key, value in usage.items()]
    return cards, skipped, unresolved, coverage


def serialize_cards(cards):
    lines, previous = [], []
    for card in cards:
        common = 0
        for old, new in zip(previous, card['path']):
            if old != new:
                break
            common += 1
        if previous != card['path'] and common == len(card['path']):
            common -= 1
        for level in range(common, len(card['path'])):
            lines.extend(['#' * (level + 1) + ' ' + card['path'][level], ''])
        meta = json.dumps({'id': card['id'], 'type': 'qa'}, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e')
        lines.extend(['<!-- recall:card ' + meta + ' -->', '问题：' + card['front'], '', card['back'], '<!-- recall:end -->', '', ''])
        previous = card['path']
    return '\n'.join(lines)


def split_cards(cards):
    parts, current = [], []
    for card in cards:
        require(len(serialize_cards([card]).encode()) <= MAX_BYTES, 'A single card exceeds the file limit')
        if current and (len(current) >= 1000 or len(serialize_cards(current + [card]).encode()) > MAX_BYTES):
            parts.append(current)
            current = []
        current.append(card)
    if current:
        parts.append(current)
    return parts


def batch_documents(folder, manifest):
    documents, offset = [], 0
    for item in manifest['files']:
        name = item if isinstance(item, str) else item['name']
        path = (folder / name).resolve(strict=True)
        require(path.parent == folder.resolve() and not (folder / name).is_symlink(), 'Batch file escapes its folder')
        count = len(manifest['cards']) if len(manifest['files']) == 1 else item['card_count']
        text = path.read_text(encoding='utf-8')
        if isinstance(item, dict) and item.get('sha256'):
            require(hashlib.sha256(text.encode()).hexdigest() == item['sha256'], 'Archived Markdown checksum mismatch')
        documents.append({'name': name, 'text': text, 'expected': manifest['cards'][offset:offset + count]})
        offset += count
    require(offset == len(manifest['cards']) == manifest['card_count'], 'Manifest file counts mismatch')
    return documents


def verify_batch(project, folder, config, manifest=None):
    folder = Path(folder).resolve(strict=True)
    manifest = manifest or read_json(folder / 'manifest.json')
    histories = []
    for path, old in history_manifests(project):
        if path.parent.resolve() != folder:
            histories.append({'documents': batch_documents(path.parent, old), 'import_parent': old.get('import_parent')})
    request = {'project': str(project), 'parser': config['parser'], 'documents': batch_documents(folder, manifest),
               'history': histories, 'import_parent': manifest.get('import_parent')}
    validator = Path(__file__).with_name('verify_recall.mjs')
    with tempfile.TemporaryDirectory(prefix='recall-verify-') as temporary:
        request_path = Path(temporary) / 'request.json'
        exclusive_json(request_path, request)
        result = subprocess.run(['node', str(validator), str(request_path)], capture_output=True, text=True, timeout=120)
    require(result.returncode == 0, 'Actual Recall parser validation failed:\n' + result.stderr + result.stdout)
    return json.loads(result.stdout)


def create_archive(project, config, extraction, plan, include_unchanged=False):
    history = source_history(project, extraction['source_document_id'])
    cards, skipped, unresolved, coverage = build_cards(extraction, plan, history, include_unchanged)
    if not cards:
        return {'status': 'no_changes', 'skipped': len(skipped), 'message': 'No empty batch created; previous generated files are not proof of APP import'}
    now = datetime.now(ZoneInfo(config['timezone']))
    batch = now.strftime('%Y%m%dT%H%M%S%f%z') + '-' + uuid.uuid4().hex[:8]
    root = archive_root(project) / 'batches'
    root.mkdir(exist_ok=True)
    manifest = {key: extraction[key] for key in ['source_document_id', 'source_url', 'canonical_url', 'source_title', 'revision',
                                               'scope', 'source_sha256', 'yellow_colors']}
    if extraction.get('source_mode') == 'screenshots':
        manifest.update({'source_mode': 'screenshots', 'image_decisions': extraction['image_decisions']})
    manifest.update({'version': 1, 'batch': batch, 'created_at': now.isoformat(), 'status': 'generated',
                     'allowed_paths': plan['allowed_paths'], 'hierarchy_confirmed': True, 'import_parent': plan.get('import_parent'),
                     'include_unchanged': include_unchanged, 'planned_count': len(plan['cards']), 'card_count': len(cards),
                     'cards': cards, 'skipped': skipped, 'unresolved': unresolved, 'coverage': coverage,
                     'resource_decisions': plan.get('resource_decisions', []), 'scope_notes': plan.get('scope_notes', []), 'files': []})
    destination = root / batch
    with tempfile.TemporaryDirectory(prefix='.pending-', dir=root) as temporary:
        stage = Path(temporary)
        for index, part in enumerate(split_cards(cards), 1):
            name = f'cards-{batch}-{index:03}.md'
            text = serialize_cards(part)
            (stage / name).write_text(text, encoding='utf-8')
            manifest['files'].append({'name': name, 'card_count': len(part), 'sha256': hashlib.sha256(text.encode()).hexdigest()})
        manifest['validation'] = verify_batch(project, stage, config, manifest)
        exclusive_json(stage / 'manifest.json', manifest)
        notes = ['# 本批检查说明', '', f'- 卡片：{len(cards)}；跳过历史重复：{len(skipped)}；计划：{len(plan["cards"])}。',
                 '- 导入位置：' + ('根目录' if not manifest['import_parent'] else ' / '.join(manifest['import_parent'])) + '。',
                 '- 卡组路径：' + '；'.join(' / '.join(path) for path in manifest['allowed_paths']) + '。',
                 '- 旧文件、真实 APP 数据和复习进度未修改。文件不预填 importedAt。',
                 '- 仅实际解析器与纯内存验证通过；尚未在 iPhone PWA 导入。', '', '## 来源', '',
                 f'[{extraction["source_title"]}]({extraction["source_url"]})；版本 {extraction["revision"]}。', '', '## 口径提醒', '']
        notes.extend('- ' + note for note in plan.get('scope_notes', []))
        notes.extend(['', '## 待确认', ''])
        notes.extend('- ' + item['reason'] + ' 原文：' + item['text'] for item in unresolved)
        if extraction.get('source_mode') == 'screenshots':
            notes.extend(['', '## 截图待确认', ''])
            notes.extend(f'- 图片 {item["order"]}：{item["reason"]}' for item in extraction['image_decisions']
                         if item['decision'] == 'unresolved')
        (stage / 'review-notes.md').write_text('\n'.join(notes) + '\n', encoding='utf-8')
        require(not destination.exists(), 'Batch already exists; refuse overwrite')
        os.rename(stage, destination)
    return {'status': 'generated', 'batch_directory': str(destination), 'files': [str(destination / item['name']) for item in manifest['files']],
            'card_count': len(cards), 'skipped': len(skipped), 'validation': manifest['validation']}


def rebuild_index(project):
    root = archive_root(project)
    lines = ['# Recall 卡片批次汇总', '', '仅登记独立文件；不是 APP 导入文件。generated 表示已生成，不是已导入。', '',
             '[归档约定](README.md)', '']
    for path, manifest in history_manifests(project):
        lines.extend(['## ' + manifest['batch'], '- 来源：' + manifest['source_title'],
                      f'- 卡片：{manifest["card_count"]}；状态：{manifest["status"]}',
                      '- 生成时间：' + manifest['created_at']])
        for document in batch_documents(path.parent, manifest):
            relative = (path.parent / document['name']).relative_to(root).as_posix()
            lines.append(f'- [{document["name"]}]({relative})')
        for package in sorted(path.parent.glob('*.recall-media.json')):
            require(not package.is_symlink() and package.is_file(), 'Image package must be a regular archived file')
            relative = package.relative_to(root).as_posix()
            lines.append(f'- 带图包：[{package.name}]({relative})')
        lines.append('')
    require(not (root / 'index.md').is_symlink(), 'Index must not be a symlink')
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=root, delete=False, prefix='.index-') as handle:
        temporary = Path(handle.name)
        handle.write('\n'.join(lines))
    try:
        os.replace(temporary, root / 'index.md')
    finally:
        temporary.unlink(missing_ok=True)
    return {'index': str(root / 'index.md'), 'batches': len(history_manifests(project))}


def main():
    parser = argparse.ArgumentParser(description='Read-only source processing and immutable Recall card batches')
    commands = parser.add_subparsers(dest='command', required=True)
    setup = commands.add_parser('configure')
    setup.add_argument('--project', required=True)
    setup.add_argument('--parser', default='src/lib/memory-markdown.ts')
    setup.add_argument('--timezone', required=True)
    extract = commands.add_parser('extract')
    extract.add_argument('--source', required=True)
    extract.add_argument('--url', required=True)
    extract.add_argument('--output', required=True)
    extract.add_argument('--yellow-color', action='append')
    extract.add_argument('--mode', choices=['yellow', 'screenshots'], default='yellow')
    extract.add_argument('--selections')
    archive = commands.add_parser('archive')
    archive.add_argument('--project', required=True)
    archive.add_argument('--source', required=True)
    archive.add_argument('--plan', required=True)
    archive.add_argument('--include-unchanged', action='store_true')
    archive.add_argument('--yellow-color', action='append')
    archive.add_argument('--mode', choices=['yellow', 'screenshots'], default='yellow')
    archive.add_argument('--selections')
    archive.add_argument('--confirm', action='store_true')
    index = commands.add_parser('index')
    index.add_argument('--project', required=True)
    index.add_argument('--confirm', action='store_true')
    verify = commands.add_parser('verify')
    verify.add_argument('--project', required=True)
    verify.add_argument('--batch', required=True)
    args = parser.parse_args()
    if args.command == 'configure':
        result = configure(args.project, args.parser, args.timezone)
    elif args.command == 'extract':
        result = extract_for_mode(read_json(args.source), args.url, args.mode, args.yellow_color, args.selections)
        exclusive_json(args.output, result)
        result = {'output': args.output, 'highlights': len(result['highlights']), 'unsupported': result['unsupported'], 'resources': result['resources']}
    else:
        project, config = load_config(args.project)
        if args.command == 'verify':
            result = verify_batch(project, args.batch, config)
        else:
            require(args.confirm, 'Use --confirm for the requested local archive/index write')
            if args.command == 'index':
                result = rebuild_index(project)
            else:
                plan = read_json(args.plan)
                require(args.mode != 'screenshots' or args.selections, 'Screenshot archives require --selections')
                extraction = extract_for_mode(read_json(args.source), plan['source_url'], args.mode, args.yellow_color, args.selections)
                result = create_archive(project, config, extraction, plan, args.include_unchanged)
    print(dump_json(result), end='')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, ET.ParseError, subprocess.SubprocessError) as error:
        print(f'recall_batch: {error}', file=sys.stderr)
        sys.exit(1)
