import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from media_package import compress, pack
from PIL import Image, ImageDraw


class MediaPackageTests(unittest.TestCase):
    def test_compressed_bundle_deduplicates_and_preserves_card_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = root / 'source.png'
            image = Image.new('RGB', (2400, 1600), 'white')
            ImageDraw.Draw(image).rectangle((100, 400, 2300, 800), outline='red', width=8)
            image.save(original)
            compressed = root / 'analysis.webp'
            compress(original, compressed)
            with Image.open(compressed) as result:
                self.assertEqual(result.size, (2000, 1333))
            selections = root / 'selections.json'
            selections.write_text(json.dumps({'source_document_id': 'doc', 'revision': 1, 'images': [
                {'block_key': 'block', 'decision': 'selected', 'file': 'source.png', 'sha256': hashlib.sha256(original.read_bytes()).hexdigest()}
            ]}))
            batch = root / 'batch'
            batch.mkdir()
            cards = [{'id': identity, 'path': ['Examples'], 'front': 'Question ' + identity, 'back': 'Selected answer', 'evidence': [{'block_key': 'block:frame:unit'}]} for identity in ['card-1', 'card-2']]
            (batch / 'manifest.json').write_text(json.dumps({'source_mode': 'screenshots', 'source_document_id': 'doc', 'revision': 1, 'source_url': 'https://example.com/doc', 'cards': cards}))
            output = root / 'bundle.recall-media.json'
            report = pack(batch, selections, output)
            value = json.loads(output.read_text())
            self.assertEqual(report['images'], 1)
            self.assertEqual(report['cards'], 2)
            self.assertIn('"id": "card-1"', value['markdown'])
            self.assertEqual(value['markdown'].count('recall://'), 2)
            self.assertEqual(value['markdown'].count('[来源文档]'), 2)
            self.assertEqual(json.loads((batch / 'manifest.json').read_text())['cards'], cards)
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                pack(batch, selections, output)

    def test_rejects_animated_image(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = Image.new('RGB', (20, 20), 'red')
            second = Image.new('RGB', (20, 20), 'blue')
            original = root / 'animated.gif'
            first.save(original, save_all=True, append_images=[second])
            with self.assertRaisesRegex(ValueError, 'static'):
                compress(original, root / 'result.webp')


if __name__ == '__main__':
    unittest.main()
