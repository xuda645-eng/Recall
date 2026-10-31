import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export function createTaskPreviewServer({ directory, demoSnapshot }) {
  const root = resolve(directory);
  const demo = demoSnapshot === undefined ? '' : `<script>if(!localStorage.getItem("recall.snapshot.v1")){localStorage.setItem("recall.snapshot.v1",${JSON.stringify(JSON.stringify(demoSnapshot)).replace(/</g, '\\u003c')});}</script>`;
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        response.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: 'PREVIEW_LOCAL_ONLY', message: 'Preview has no cloud connection.' }));
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method || 'GET')) { response.writeHead(405).end(); return; }
      const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const actual = await realpath(file);
      if (!actual.startsWith(await realpath(root) + sep)) { response.writeHead(403).end(); return; }
      let contents = await readFile(actual);
      if (file === resolve(root, 'index.html') && demo) contents = Buffer.from(contents.toString().replace('</head>', `${demo}</head>`));
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)));
  const port = Number(process.argv[3] || 4408);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port');
  const demoSnapshot = process.argv[4] ? JSON.parse(await readFile(resolve(process.argv[4]), 'utf8')) : undefined;
  const server = createTaskPreviewServer({ directory, demoSnapshot });
  server.listen(port, '127.0.0.1', () => console.log(`Task preview: http://127.0.0.1:${port}/ (local only, no production API)`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
