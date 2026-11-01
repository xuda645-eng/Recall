import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createTaskPreviewServer } from '../../scripts/serve-task-preview.mjs';

const staticServer = createTaskPreviewServer({ directory: fileURLToPath(new URL('./site', import.meta.url)) });
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/index.html') {
    response.writeHead(308, { Location: `/${url.search}` }).end();
    return;
  }
  staticServer.emit('request', request, response);
});
server.listen(4397, '127.0.0.1', () => console.log('Static device probe with Pages-style index redirect: http://127.0.0.1:4397'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
