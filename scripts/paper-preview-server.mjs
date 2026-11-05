import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(process.env.RECALL_PAPER_BUILD_DIR || 'dist');
const port = Number(process.env.RECALL_PAPER_PORT || 4408);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    if (url.pathname.startsWith('/api/')) { response.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Local paper preview has no cloud connection' })); return; }
    const filename = resolve(root, url.pathname === '/' ? 'index.html' : '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    let content = await readFile(filename);
    if (url.pathname === '/iphone15.html') content = Buffer.from(content.toString().replaceAll('正式站真实数据', '本地隔离副本 · 待确认').replaceAll('返回正式首页', '打开本地应用').replaceAll('真实页面', '本地应用'));
    response.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404).end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Paper preview only: http://127.0.0.1:${port}/iphone15.html`));
