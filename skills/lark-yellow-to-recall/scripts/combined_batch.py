import argparse
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

import recall_batch as batch


def local_file(root, value):
    batch.require(isinstance(value, str) and value and not Path(value).is_absolute(), 'Source files must be relative to the source set')
    path = (root / value).resolve(strict=True)
    batch.require(path.is_relative_to(root) and path.is_file(), 'Source file escapes the source set directory')
    return path


def namespace(source, block_key):
    return json.dumps([source['source_document_id'], source['mode'], block_key], ensure_ascii=False, separators=(',', ':'))


def extract(source_set_path):
    source_set_path = Path(source_set_path).resolve(strict=True)
    root = source_set_path.parent
    collection = batch.read_json(source_set_path)
    batch.require(collection.get('same_topic_confirmed') is True, 'Confirm that the supplied documents belong to the same topic')
    topic_key = collection.get('topic_key')
    batch.require(isinstance(topic_key, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', topic_key), 'A stable ASCII topic_key is required')
    title = collection.get('title')
    batch.require(isinstance(title, str) and title.strip() and '\n' not in title and '\r' not in title, 'A topic title is required')
    inputs = collection.get('sources')
    batch.require(isinstance(inputs, list) and len(inputs) >= 2, 'At least two explicitly supplied source documents are required')
    sources, highlights, blocks, resources, unsupported = [], [], {}, [], []
    aliases, identities = set(), set()
    for item in inputs:
        key, mode, url = item.get('key'), item.get('mode'), item.get('url')
        batch.require(isinstance(key, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', key) and key not in aliases, 'Source keys must be unique ASCII identifiers')
        batch.require(mode in {'yellow', 'screenshots'}, 'Only marked cloud documents are supported; do not read raw Minutes')
        batch.require(isinstance(url, str) and url.startswith('https://') and not any(character in url for character in '\r\n()< >'), 'Invalid source URL')
        aliases.add(key)
        selections = local_file(root, item['selections']) if item.get('selections') else None
        batch.require(mode != 'screenshots' or selections, 'Review screenshot selections before combining')
        extraction = batch.extract_for_mode(batch.read_json(local_file(root, item['file'])), url, mode,
                                            item.get('yellow_colors'), selections)
        identity = (extraction['source_document_id'], mode)
        batch.require(identity not in identities, 'Duplicate source document/mode; Wiki and Docx aliases are not new sources')
        identities.add(identity)
        source = {field: extraction[field] for field in ['source_document_id', 'source_url', 'canonical_url',
                  'source_title', 'revision', 'scope', 'source_sha256', 'yellow_colors']}
        source.update({'key': key, 'mode': mode})
        if mode == 'screenshots':
            source['image_decisions'] = extraction['image_decisions']
        sources.append(source)
        for block_key, block in extraction['blocks'].items():
            renamed = copy.deepcopy(block)
            renamed['block_key'] = namespace(source, block_key)
            if renamed.get('question'):
                renamed['question']['block_key'] = namespace(source, renamed['question']['block_key'])
            blocks[renamed['block_key']] = renamed
        for region in extraction['highlights']:
            renamed = copy.deepcopy(region)
            renamed['block_key'] = namespace(source, region['block_key'])
            renamed['source'] = {field: source[field] for field in ['source_document_id', 'source_url', 'source_title', 'revision', 'mode']}
            if renamed.get('question'):
                renamed['question']['block_key'] = namespace(source, renamed['question']['block_key'])
            highlights.append(renamed)
        resources.extend({**resource, 'key': namespace(source, resource['key'])} for resource in extraction['resources'])
        unsupported.extend({'source': key, **issue} for issue in extraction['unsupported'])
    signature = sorted((source['source_document_id'], source['mode'], str(source['revision']), source['source_sha256'],
                        source.get('image_decisions', [])) for source in sources)
    evidence_signature = sorted((region['block_key'], region['run_index'], region['text']) for region in highlights)
    digest = hashlib.sha256(batch.dump_json([signature, evidence_signature]).encode()).hexdigest()
    return {'source_mode': 'combined', 'topic_key': topic_key, 'source_document_id': 'combined:' + topic_key,
            'source_title': title.strip(), 'source_url': sources[0]['source_url'], 'canonical_url': sources[0]['canonical_url'],
            'revision': 'sha256:' + digest, 'source_sha256': digest, 'yellow_colors': [], 'scope': 'combined-selections',
            'sources': sources, 'highlights': highlights, 'blocks': blocks, 'resources': resources, 'unsupported': unsupported}


def prepare_plan(extraction, draft):
    plan = copy.deepcopy(draft)
    batch.require(plan.get('topic_key') == extraction['topic_key'], 'Plan topic_key mismatch')
    steps = plan.get('learning_path')
    batch.require(isinstance(steps, list) and steps and all(isinstance(step, str) and step.strip() for step in steps), 'Describe the unified learning path before combining')
    sources = {source['key']: source for source in extraction['sources']}

    def translate(ref):
        batch.require(isinstance(ref, dict) and set(ref) == {'source', 'block_key', 'run_index'}, 'Combined refs require source, block_key and run_index')
        batch.require(ref['source'] in sources, 'Unknown source key')
        batch.ref_key({'block_key': ref['block_key'], 'run_index': ref['run_index']})
        return {'block_key': namespace(sources[ref['source']], ref['block_key']), 'run_index': ref['run_index']}

    for card in plan.get('cards', []):
        batch.require(not card.get('context_blocks'), 'Use source-qualified context_refs in combined plans')
        card['refs'] = [translate(ref) for ref in card.get('refs', [])]
    plan['context_refs'] = [translate(ref) for ref in plan.get('context_refs', [])]
    for item in plan.get('unresolved', []):
        item['refs'] = [translate(ref) for ref in item.get('refs', [])]
    for item in plan.get('resource_decisions', []):
        batch.require(item.get('source') in sources, 'Resource decisions require a known source key')
        item['key'] = namespace(sources[item.pop('source')], item['key'])
    return plan


def main():
    parser = argparse.ArgumentParser(description='Integrate marked documents into one evidence-backed Recall learning batch')
    commands = parser.add_subparsers(dest='command', required=True)
    extraction_command = commands.add_parser('extract')
    extraction_command.add_argument('--sources', type=Path, required=True)
    extraction_command.add_argument('--output', type=Path, required=True)
    archive_command = commands.add_parser('archive')
    archive_command.add_argument('--sources', type=Path, required=True)
    archive_command.add_argument('--plan', type=Path, required=True)
    archive_command.add_argument('--project', required=True)
    archive_command.add_argument('--include-unchanged', action='store_true')
    archive_command.add_argument('--confirm', action='store_true')
    args = parser.parse_args()
    extraction = extract(args.sources)
    if args.command == 'extract':
        batch.exclusive_json(args.output, extraction)
        result = {'output': str(args.output), 'sources': len(extraction['sources']), 'evidence_units': len(extraction['highlights'])}
    else:
        batch.require(args.confirm, 'Use --confirm for the requested local combined archive')
        project, config = batch.load_config(args.project)
        plan = prepare_plan(extraction, batch.read_json(args.plan))
        result = batch.create_archive(project, config, extraction, plan, args.include_unchanged)
    print(batch.dump_json(result), end='')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f'combined_batch: {error}', file=sys.stderr)
        sys.exit(1)
