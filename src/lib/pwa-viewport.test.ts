import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const source = readFileSync('public/pwa-viewport.js', 'utf8');
const original = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

it.each([
  ['iPhone', true, false, 'auto'],
  ['iPhone', false, true, 'auto'],
  ['iPhone', false, false, 'cover'],
  ['iPad', true, true, 'cover'],
  ['Android', true, true, 'cover'],
  ['Macintosh', true, true, 'cover'],
])('uses %s standalone=%s mode=%s without touching storage or network', (userAgent, standalone, mode, expected) => {
  const viewport = { content: original };
  runInNewContext(source, {
    navigator: { userAgent, standalone },
    matchMedia: () => ({ matches: mode }),
    document: { querySelector: () => viewport },
  });
  expect(viewport.content).toBe(original.replace('viewport-fit=cover', `viewport-fit=${expected}`));
});

it('recognizes the real reported iPhone user agent without depending on its spoofed OS version', () => {
  const viewport = { content: original };
  runInNewContext(source, {
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/27.0.1 Mobile/15E148 Safari/604.1', standalone: true },
    document: { querySelector: () => viewport },
  });
  expect(viewport.content).toContain('viewport-fit=auto');
});

it('leaves an absent or already-managed viewport unchanged', () => {
  for (const viewport of [null, { content: original.replace('cover', 'auto') }]) {
    expect(() => runInNewContext(source, {
      navigator: { userAgent: 'iPhone', standalone: true },
      document: { querySelector: () => viewport },
    })).not.toThrow();
    if (viewport) expect(viewport.content).toContain('viewport-fit=auto');
  }
});

it('is parser-blocking before app scripts and retains cover as the non-JavaScript fallback', () => {
  const html = readFileSync('index.html', 'utf8');
  expect(html).toContain('viewport-fit=cover');
  expect(html).toContain('<script src="%BASE_URL%pwa-viewport.js"></script>');
  expect(html.indexOf('pwa-viewport.js')).toBeLessThan(html.indexOf('type="module"'));
  expect(html).not.toContain('user-scalable=no');
});
