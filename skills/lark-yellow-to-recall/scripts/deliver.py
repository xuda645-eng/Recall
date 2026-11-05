import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import recall_batch as batch


DESTINATION_NAME = '\u5f85\u5bfc\u5165'


def short_topic(value):
    value = unicodedata.normalize('NFC', value)
    batch.require(value and value == value.strip() and len(value) <= 20, 'Use a short topic of 1-20 characters')
    batch.require(not value.startswith('.') and not value.endswith('.') and not re.search(r'[<>:"/\\|?*\x00-\x1f\x7f]', value),
                  'Topic contains an unsafe filename character')
    return value


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def deliver(project, folder, topic):
    project, config = batch.load_config(project)
    supplied = Path(folder)
    batch.require(not supplied.is_symlink(), 'Batch must not be a symlink')
    folder = supplied.resolve(strict=True)
    archives = project / 'card-imports/batches'
    batch.require(not archives.is_symlink() and folder.is_relative_to(project) and folder.parent == archives.resolve(),
                  'Choose an archived batch in this project')
    batch.require(not (folder / 'manifest.json').is_symlink(), 'Manifest must not be a symlink')
    manifest = batch.read_json(folder / 'manifest.json')
    batch.require(manifest.get('status') == 'generated' and manifest.get('validation', {}).get('status') == 'passed',
                  'Archive must have passed its original import and history validation')
    documents = batch.batch_documents(folder, manifest)
    packages = sorted(folder.glob('*.recall-media.json'))
    batch.require(len(packages) <= 1, 'Choose a batch with at most one media package')
    batch.require(all(not path.is_symlink() and path.is_file() for path in packages), 'Package must be a regular file')
    screenshots = manifest.get('source_mode') == 'screenshots' or any(source.get('mode') == 'screenshots' for source in manifest.get('sources', []))
    batch.require(not screenshots or packages, 'Finish the media package before delivering a screenshot batch')
    sources = [folder / document['name'] for document in documents] + packages
    source_hashes = {path.name: checksum(path) for path in sources}
    output = project / DESTINATION_NAME
    batch.require(not output.is_symlink(), 'Delivery directory must not be a symlink')
    if (project / '.git').exists():
        ignored = subprocess.run(['git', 'check-ignore', '--no-index', '-q', '--', str(output / 'privacy-check.md')], cwd=project)
        batch.require(ignored.returncode == 0, 'Ignore the private delivery directory in Git before generating files')
    topic = short_topic(topic)
    date = datetime.fromisoformat(manifest['created_at'])
    batch.require(date.tzinfo is not None, 'Archive generation time must include its timezone')
    stem = topic + '-' + date.astimezone(ZoneInfo(config['timezone'])).strftime('%Y-%m-%d')
    record_path = folder / 'delivery.json'
    if record_path.exists():
        batch.require(not record_path.is_symlink(), 'Delivery record must not be a symlink')
        record = batch.read_json(record_path)
        batch.require(record['source_hashes'] == source_hashes and record['topic'] == topic, 'Existing delivery differs; do not overwrite it')
        for item in record['files']:
            path = project / item['path']
            batch.require(path.parent == output and not path.is_symlink() and checksum(path) == item['sha256'], 'Existing delivery checksum mismatch')
        return {**record, 'directory': str(output), 'main_file': str(project / record['main_file']), 'reused': True}
    request = {'project': str(project), 'parser': config['parser'], 'documents': documents,
               'history': [], 'import_parent': manifest.get('import_parent')}
    if packages:
        request.update({'media_file': str(packages[0]), 'media_cards': manifest['cards'],
                        'media_source_url': manifest.get('source_url') if manifest.get('source_mode') != 'combined' else None})
    with tempfile.TemporaryDirectory(prefix='recall-deliver-') as temporary:
        request_path = Path(temporary) / 'request.json'
        batch.exclusive_json(request_path, request)
        result = subprocess.run(['node', str(Path(__file__).with_name('verify_recall.mjs')), str(request_path)],
                                capture_output=True, text=True, timeout=120)
    batch.require(result.returncode == 0, 'Actual delivery parser validation failed:\n' + result.stderr + result.stdout)
    validation = json.loads(result.stdout)
    batch.require(source_hashes == {path.name: checksum(path) for path in sources}, 'Source files changed during validation')
    output.mkdir(exist_ok=True)
    for sequence in range(1, 10000):
        candidate = stem + (f'-{sequence}' if sequence > 1 else '')
        markdown_names = [candidate + (f'-{index:02}' if len(documents) > 1 else '') + '.md'
                          for index in range(1, len(documents) + 1)]
        names = markdown_names + ([candidate + '.recall-media.json'] if packages else [])
        if not any(path.name == candidate or path.name.startswith(candidate + '.') or path.name.startswith(candidate + '-') for path in output.iterdir()):
            break
    else:
        raise ValueError('Too many same-day deliveries')
    files = []
    for source, name in zip(sources, names):
        destination = output / name
        with destination.open('xb') as handle:
            handle.write(source.read_bytes())
        batch.require(checksum(destination) == source_hashes[source.name], 'Delivery copy checksum mismatch')
        files.append({'path': destination.relative_to(project).as_posix(), 'sha256': source_hashes[source.name]})
    main_file = files[-1 if packages else 0]['path']
    record = {'version': 1, 'batch': manifest['batch'], 'topic': topic, 'status': 'generated_not_imported',
              'source_hashes': source_hashes, 'main_file': main_file, 'files': files, 'validation': validation}
    batch.exclusive_json(record_path, record)
    return {**record, 'directory': str(output), 'main_file': str(project / main_file), 'reused': False}


def main():
    parser = argparse.ArgumentParser(description='Deliver verified Recall files in the project shallow import directory')
    parser.add_argument('--project', required=True)
    parser.add_argument('--batch', type=Path, required=True)
    parser.add_argument('--topic', required=True)
    parser.add_argument('--confirm', action='store_true')
    args = parser.parse_args()
    batch.require(args.confirm, 'Use --confirm to create the requested private delivery files')
    print(batch.dump_json(deliver(args.project, args.batch, args.topic)), end='')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f'deliver: {error}', file=sys.stderr)
        sys.exit(1)
