import argparse
import hashlib
import io
import json
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET

import fitz
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public' / 'favicon.svg'
OUTPUT = ROOT / 'miaoda' / 'icons'
NAMESPACE = 'http://www.w3.org/2000/svg'
BACKGROUND = (79, 96, 74)
SUPERSAMPLING = 4
SIZES = {
    'apple-touch-icon.png': 180,
    'icon-192.png': 192,
    'icon-512.png': 512,
    'icon-maskable-512.png': 512,
    'icon-1024.png': 1024,
}


def master_svg():
    ET.register_namespace('', NAMESPACE)
    source = ET.fromstring(SOURCE.read_bytes())
    background = source.find(f'{{{NAMESPACE}}}rect')
    paths = source.findall(f'{{{NAMESPACE}}}path')
    if source.get('viewBox') != '0 0 100 100' or background is None or len(paths) != 2:
        raise ValueError('Unexpected brand vector geometry')
    if background.get('fill') != '#4f604a' or [path.get('fill') for path in paths] != ['white', '#4f604a']:
        raise ValueError('Unexpected brand vector colors')
    master = ET.Element(f'{{{NAMESPACE}}}svg', {
        'width': '1024', 'height': '1024', 'viewBox': '0 0 100 100',
    })
    ET.SubElement(master, f'{{{NAMESPACE}}}rect', {
        'width': '100', 'height': '100', 'fill': background.get('fill'),
    })
    group = ET.SubElement(master, f'{{{NAMESPACE}}}g', {
        'transform': 'translate(50 50) scale(0.8) translate(-54.5 -50)',
    })
    for path in paths:
        group.append(deepcopy(path))
    ET.indent(master, space='  ')
    return ET.tostring(master, encoding='utf-8', xml_declaration=True) + b'\n'


def render_png(master, size):
    with fitz.open(stream=master, filetype='svg') as source:
        with fitz.open(stream=source.convert_to_pdf(), filetype='pdf') as vector:
            page = vector[0]
            high_resolution = size * SUPERSAMPLING
            matrix = fitz.Matrix(high_resolution / page.rect.width, high_resolution / page.rect.height)
            pixels = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB, alpha=False)
            if (pixels.width, pixels.height) != (high_resolution, high_resolution):
                raise ValueError('Unexpected vector render dimensions')
            image = Image.frombytes('RGB', (pixels.width, pixels.height), pixels.samples)
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format='PNG', optimize=True)
    return output.getvalue()


def inspect_png(data, size):
    with Image.open(io.BytesIO(data)) as image:
        if image.mode != 'RGB' or image.size != (size, size) or 'transparency' in image.info:
            raise ValueError('Icon must be native-size opaque RGB')
        for coordinate in range(size):
            for position in [(coordinate, 0), (coordinate, size - 1), (0, coordinate), (size - 1, coordinate)]:
                if image.getpixel(position) != BACKGROUND:
                    raise ValueError('Icon background must cover the complete square without a rounded mask')
        difference = ImageChops.difference(image, Image.new('RGB', image.size, BACKGROUND))
        bounds = difference.getbbox()
        if bounds is None or max(bounds[2] - bounds[0], bounds[3] - bounds[1]) > size * 0.60:
            raise ValueError('Brand artwork exceeds the canonical safe padding')
        maximum_radius = 0
        for vertical in range(bounds[1], bounds[3]):
            for horizontal in range(bounds[0], bounds[2]):
                if image.getpixel((horizontal, vertical)) == BACKGROUND:
                    continue
                radius = ((horizontal + 0.5 - size / 2) ** 2 + (vertical + 0.5 - size / 2) ** 2) ** 0.5 / size
                maximum_radius = max(maximum_radius, radius)
        if maximum_radius > 0.40:
            raise ValueError('Brand artwork exceeds the maskable central safe circle')
        sparkle = image.getpixel((round(size * 0.496), round(size * 0.404)))
        stem = image.getpixel((round(size * 0.304), round(size * 0.70)))
        if sparkle != BACKGROUND or stem != (255, 255, 255):
            raise ValueError('The white R and green sparkle do not match the source brand')
    return {
        'size': [size, size], 'mode': 'RGB', 'alpha': False,
        'backgroundRgb': list(BACKGROUND), 'artworkBounds': list(bounds),
        'maximumSafeRadius': round(maximum_radius, 6),
        'vectorRenderSize': [size * SUPERSAMPLING, size * SUPERSAMPLING],
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser(description='Render Recall brand vectors into opaque square Miaoda PWA icons')
    parser.add_argument('--check', action='store_true', help='Validate existing artifacts without writing files')
    args = parser.parse_args()
    master = master_svg()
    artifacts = {OUTPUT / 'recall-icon-master.svg': master, OUTPUT.parent / 'favicon.svg': master}
    artifacts.update({OUTPUT / filename: render_png(master, size) for filename, size in SIZES.items()})
    if not args.check:
        OUTPUT.mkdir(parents=True, exist_ok=True)
    for path, data in artifacts.items():
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f'Generated artifact does not match the brand vector: {path}')
        else:
            path.write_bytes(data)
    report = {
        'mode': 'checked' if args.check else 'generated',
        'vectorSource': str(SOURCE), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'master': str(OUTPUT / 'recall-icon-master.svg'),
        'masterSha256': hashlib.sha256(master).hexdigest(),
        'supersampling': SUPERSAMPLING,
        'icons': {filename: inspect_png(artifacts[OUTPUT / filename], size) for filename, size in SIZES.items()},
    }
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
