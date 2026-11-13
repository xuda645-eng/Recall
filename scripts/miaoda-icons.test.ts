// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const output = new URL('../miaoda/icons/', import.meta.url);

function paths(svg: string) {
  return [...svg.matchAll(/<path\b[^>]*>/g)].map(([tag]) => ({
    geometry: tag.match(/\bd="([^"]+)"/)?.[1],
    fill: tag.match(/\bfill="([^"]+)"/)?.[1],
  }));
}

describe('Miaoda PWA brand icons', () => {
  it('preserves the exact original R and sparkle vectors with an unmasked square background', () => {
    const source = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
    const master = readFileSync(new URL('recall-icon-master.svg', output), 'utf8');
    expect(paths(master)).toEqual(paths(source));
    expect(paths(master)).toHaveLength(2);
    expect(master).toContain('width="1024" height="1024" viewBox="0 0 100 100"');
    expect(master).toContain('<rect width="100" height="100" fill="#4f604a"');
    expect(master).toContain('translate(50 50) scale(0.8) translate(-54.5 -50)');
    expect(master).not.toMatch(/<(?:mask|clipPath|filter|image)\b|\b(?:rx|ry|opacity)=/);
    expect(readFileSync(new URL('../favicon.svg', output), 'utf8')).toBe(master);
  });
});
