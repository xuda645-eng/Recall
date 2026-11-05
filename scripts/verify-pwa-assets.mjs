import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { resolve4 } from 'node:dns/promises';

const directory = resolve(process.argv[2] || 'dist');
const output = process.argv[3];
const origin = new URL('https://recall-memory.pages.dev/');
const ipv4 = process.env.RECALL_PRODUCTION_IPV4;
if (ipv4 && (isIP(ipv4) !== 4 || !(await resolve4(origin.hostname)).includes(ipv4))) throw new Error('RECALL_PRODUCTION_IPV4 must match a current production DNS A record');
const lookup = ipv4 ? (_hostname, options, done) => options.all ? done(null, [{ address: ipv4, family: 4 }]) : done(null, ipv4, 4) : undefined;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function download(path, redirects = 0) {
  const url = new URL(path, origin);
  if (url.origin !== origin.origin || redirects > 5) throw new Error('Unexpected asset redirect');
  return new Promise((resolveDownload, reject) => {
    const connection = request(url, { signal: AbortSignal.timeout(30000), method: 'GET', family: 4, lookup, headers: { 'Cache-Control': 'no-cache' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolveDownload(download(new URL(response.headers.location, url).href, redirects + 1));
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolveDownload({ status: response.statusCode, bytes: Buffer.concat(chunks) }));
    });
    connection.setTimeout(30000, () => connection.destroy(new Error(`Asset timeout: ${path}`)));
    connection.on('error', reject);
    connection.end();
  });
}

async function files(folder, prefix = '') {
  const entries = await readdir(folder, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory() && !entry.name.startsWith('_')) paths.push(...await files(resolve(folder, entry.name), `${path}/`));
    else if (entry.isFile() && /\.(?:html|js|css|svg|png|ico|woff2?|ttf|webmanifest)$/.test(path)) paths.push(path);
  }
  return paths;
}

const paths = [...await files(directory), 'version.json'];
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    const expected = digest(await readFile(resolve(directory, path)));
    let failure;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const actual = await download(path);
        if (actual.status !== 200 || digest(actual.bytes) !== expected) throw new Error(`Asset mismatch: ${path} HTTP ${actual.status}`);
        results.push({ path, sha256: expected, attempt });
        failure = null;
        break;
      } catch (error) { failure = error; }
    }
    if (failure) throw failure;
  }
}
await Promise.all(Array.from({ length: 4 }, () => worker()));
const report = { origin: origin.href, build: JSON.parse(await readFile(resolve(directory, 'version.json'), 'utf8')), verifiedAt: new Date().toISOString(), count: results.length, assets: results.sort((first, second) => first.path.localeCompare(second.path)) };
if (output) await writeFile(output, JSON.stringify(report, null, 2));
console.log(`PASS ${results.length}/${paths.length} production asset hashes; release ${report.build.releaseVersion ?? report.build.version}`);
