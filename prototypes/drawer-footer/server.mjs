import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/preview.js': ['preview.js', 'text/javascript; charset=utf-8'] };
const port = Number(process.env.RECALL_FOOTER_PORT || 4424);
createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  const file = files[pathname];
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  if (!file) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(fileURLToPath(new URL(file[0], import.meta.url)));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; connect-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'" });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500).end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local footer prototype: http://127.0.0.1:${port}/`));
