from pathlib import Path
from PIL import Image


root = Path(__file__).resolve().parents[1]
brand = (79, 96, 74)
files = ['icon-16.png', 'icon-32.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']
for filename in files:
    path = root / 'public' / 'icons' / filename
    image = Image.open(path).convert('RGB')
    old = image.getpixel((0, 0))
    if old == brand:
        continue
    pixels = image.load()
    for horizontal in range(image.width):
        for vertical in range(image.height):
            pixel = pixels[horizontal, vertical]
            opacity = max(0, min(1, (sum(pixel) - sum(old)) / (765 - sum(old))))
            pixels[horizontal, vertical] = tuple(round(channel + (255 - channel) * opacity) for channel in brand)
    image.save(path)
Image.open(root / 'public/icons/icon-32.png').save(root / 'public/favicon.ico', sizes=[(16, 16), (32, 32)])
print('Generated paper-brand PNG assets and favicon from the existing logo master')
