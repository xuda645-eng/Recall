import { createServer as createHttpServer } from 'node:http';
import { readFile, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = resolve(process.argv[2]);
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== 'app_17hv4js1tsy' || process.env.MIAODA_LOCAL_DEV !== '1'
  || process.env.NODE_ENV !== 'development') throw new Error('Authorized local launcher required');
const base = process.env.CLIENT_BASE_PATH?.replace(/\/$/, '');
if (base !== '/app/app_17hv4js1tsy') throw new Error('Unexpected local application path');
const directory = join(target, 'dist/client');
const html = await readFile(join(directory, 'index.html'), 'utf8');
if (html.includes('/@vite/client')) throw new Error('Production HTML required; build the client first');
const requireTarget = createRequire(join(target, 'package.json'));
const { createServer } = await import(pathToFileURL(requireTarget.resolve('vite')).href);
const { devProxyPlugin } = requireTarget('@lark-apaas/coding-preset-vite-react');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };
async function serveAsset(request, response, pathname) {
  let file;
  try { file = resolve(directory, `.${decodeURIComponent(pathname)}`); }
  catch { response.writeHead(400); response.end(); return true; }
  if (relative(directory, file).startsWith('..') || !types[extname(file)]) return false;
  try {
    if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink()) return false;
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    return false;
  }
}
const cdn = createHttpServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:8187');
  void serveAsset(request, response, new URL(request.url, 'http://localhost:4193').pathname)
    .then(served => { if (!served) { response.writeHead(404); response.end(); } })
    .catch(() => { response.writeHead(500); response.end(); });
});
await new Promise((ready, reject) => { cdn.once('error', reject); cdn.listen(4193, 'localhost', ready); });
const vite = await createServer({
  configFile: false, root: directory, publicDir: false, base: `${base}/`,
  plugins: [{
    name: 'frozen-production-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost:8187').pathname;
        if (!pathname.startsWith(`${base}/`)) { next(); return; }
        void serveAsset(request, response, pathname.slice(base.length))
          .then(served => { if (!served) next(); }).catch(next);
      });
    },
  }, devProxyPlugin({ serverPort: 3187, clientBasePath: base, appId: meta.app_id })],
  server: { host: 'localhost', port: 8187, strictPort: true, hmr: false },
});
await vite.listen();
const stop = async () => {
  await vite.close();
  await new Promise(ready => cdn.close(ready));
};
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
console.log('Frozen production client with SDK-owned development proxy and loopback CDN ready');
