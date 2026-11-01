import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const boot = readFileSync('public/status-diagnostics/boot.js', 'utf8');

it.each(['a', 'b', 'c'])('selects %s before rendering without storage or network access', variant => {
  const dataset: Record<string, string> = {};
  runInNewContext(boot, { URLSearchParams, location: { search: `?status-case=${variant}` }, document: { documentElement: { dataset } } });
  expect(dataset.case).toBe(variant);
});

it.each(['', '?status-case=invalid', '?status-case=%3Cscript%3E', '?case=c'])('defaults to A for unsupported input %s', search => {
  const dataset: Record<string, string> = {};
  runInNewContext(boot, { URLSearchParams, location: { search }, document: { documentElement: { dataset } } });
  expect(dataset.case).toBe('a');
});

it('retains F only when authored by the separate system-frame document, not a query parameter', () => {
  const authored: Record<string, string> = { case: 'f' };
  runInNewContext(boot, { URLSearchParams, location: { search: '?status-case=b' }, document: { documentElement: { dataset: authored } } });
  expect(authored.case).toBe('f');
  const requested: Record<string, string> = {};
  runInNewContext(boot, { URLSearchParams, location: { search: '?status-case=f' }, document: { documentElement: { dataset: requested } } });
  expect(requested.case).toBe('a');
});

it('selects the variant before CSS loads and retains the original installation metadata', () => {
  const html = readFileSync('public/status-diagnostics/index.html', 'utf8');
  expect(html.indexOf('src="./boot.js"')).toBeLessThan(html.indexOf('href="./styles.css"'));
  expect(html).toContain('content="default"');
  expect(html).toContain('href="../manifest.webmanifest"');
  expect(html).toContain("connect-src 'none'");
});
