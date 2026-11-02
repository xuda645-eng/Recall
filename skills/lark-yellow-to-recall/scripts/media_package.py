import argparse
import base64
import copy
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps
from recall_batch import serialize_cards


def compress(source, output, edge=2000):
    with Image.open(source) as image:
        if image.width * image.height > 16_000_000 or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Only static images up to 16 million pixels are supported')
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        image.save(output, format='WEBP', quality=88, method=6)
    if output.stat().st_size > 512 * 1024:
        output.unlink()
        raise ValueError('Compressed image exceeds 512 KB; split the screenshot or choose a readable crop')


def pack(batch, selections, output):
    manifest = json.loads((batch / 'manifest.json').read_text())
    selection = json.loads(selections.read_text())
    if manifest.get('source_mode') != 'screenshots' or selection['source_document_id'] != manifest['source_document_id'] or selection['revision'] != manifest['revision']:
        raise ValueError('Screenshot batch and selections must have the same document and revision')
    if output.exists():
        raise ValueError('Refuse to overwrite an existing package')
    output.parent.mkdir(parents=True, exist_ok=True)
    root = selections.parent.resolve()
    images = {}
    assets = []
    import tempfile
    with tempfile.TemporaryDirectory(prefix='recall-media-') as temporary:
        for selected in selection['images']:
            if selected['decision'] != 'selected':
                continue
            source = (root / selected['file']).resolve(strict=True)
            if not source.is_relative_to(root) or hashlib.sha256(source.read_bytes()).hexdigest() != selected['sha256']:
                raise ValueError('Source image path or checksum mismatch')
            target = Path(temporary) / (str(len(images)) + '.webp')
            with Image.open(source) as image:
                reusable = image.format == 'WEBP' and max(image.size) <= 2000 and getattr(image, 'n_frames', 1) == 1 and source.stat().st_size <= 512 * 1024
            if reusable:
                data = source.read_bytes()
            else:
                compress(source, target)
                data = target.read_bytes()
            identity = hashlib.sha256(data).hexdigest() + '.webp'
            images[selected['block_key']] = identity
            if not any(asset['id'] == identity for asset in assets):
                assets.append({'id': identity, 'mime': 'image/webp', 'base64': base64.b64encode(data).decode()})
        cards = copy.deepcopy(manifest['cards'])
        used = set()
        for card in cards:
            attached = []
            for evidence in card['evidence']:
                matching = [key for key in images if evidence['block_key'].startswith(key + ':')]
                if len(matching) != 1:
                    raise ValueError('Each screenshot evidence must resolve to exactly one reviewed image')
                identity = images[matching[0]]
                if identity not in attached:
                    attached.append(identity)
                    used.add(identity)
            card['back'] += ''.join('\n\n![来源截图](recall://' + identity + ')' for identity in attached)
            source_url = manifest.get('source_url', '')
            if not source_url.startswith('https://') or any(character in source_url for character in '\r\n()< >'):
                raise ValueError('Invalid source URL')
            card['back'] += '\n\n[来源文档](' + source_url + ')'
        markdown = serialize_cards(cards)
        payload = {'format': 'recall-media', 'version': 1, 'markdown': markdown, 'images': [asset for asset in assets if asset['id'] in used]}
        text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        if len(payload['images']) > 100 or len(text.encode()) > 16 * 1024 * 1024:
            raise ValueError('Package exceeds 100 images or 16 MB; split the batch')
        with output.open('x', encoding='utf-8') as handle:
            handle.write(text)
        return {'file': str(output), 'cards': len(cards), 'images': len(used), 'bytes': len(text.encode()), 'status': 'generated_not_imported'}


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    compression = commands.add_parser('compress')
    compression.add_argument('--input', type=Path, required=True)
    compression.add_argument('--output', type=Path, required=True)
    packaging = commands.add_parser('pack')
    packaging.add_argument('--batch', type=Path, required=True)
    packaging.add_argument('--selections', type=Path, required=True)
    packaging.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'compress':
        if args.output.exists():
            raise ValueError('Refuse to overwrite an existing image')
        compress(args.input, args.output)
        print(json.dumps({'file': str(args.output), 'bytes': args.output.stat().st_size}))
    else:
        print(json.dumps(pack(args.batch, args.selections, args.output), ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
