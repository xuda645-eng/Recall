// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = new URL('../miaoda/icons/', import.meta.url);
const sizes = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['icon-1024.png', 1024],
] as const;

describe('Miaoda PWA raster icons', () => {
  it.each(sizes)('exports %s as native %i-pixel RGB PNG with no alpha channel', (filename, size) => {
    const png = readFileSync(new URL(filename, output));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.subarray(12, 16).toString()).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(2);
    for (let offset = 8; offset < png.length; offset += 12 + png.readUInt32BE(offset)) {
      expect(png.subarray(offset + 4, offset + 8).toString()).not.toBe('tRNS');
    }
  });

  it('reproduces every artifact from supersampled vectors and validates opaque edges and mask-safe geometry', () => {
    const checked = spawnSync('python3', ['scripts/miaoda-icons.py', '--check'], {
      cwd: root, encoding: 'utf8', timeout: 30000,
    });
    expect(checked.error).toBeUndefined();
    expect(checked.status, checked.stderr).toBe(0);
    const report = JSON.parse(checked.stdout);
    expect(report.mode).toBe('checked');
    expect(report.supersampling).toBe(4);
    for (const [filename, size] of sizes) {
      const icon = report.icons[filename];
      expect(icon.size).toEqual([size, size]);
      expect(icon.mode).toBe('RGB');
      expect(icon.alpha).toBe(false);
      expect(icon.backgroundRgb).toEqual([79, 96, 74]);
      expect(icon.vectorRenderSize).toEqual([size * 4, size * 4]);
      expect(icon.maximumSafeRadius).toBeLessThanOrEqual(0.40);
      expect(icon.artworkBounds[2] - icon.artworkBounds[0]).toBeLessThanOrEqual(size * 0.60);
      expect(icon.artworkBounds[3] - icon.artworkBounds[1]).toBeLessThanOrEqual(size * 0.60);
      expect(icon.sha256).toBe(createHash('sha256').update(readFileSync(new URL(filename, output))).digest('hex'));
    }
  });
});
