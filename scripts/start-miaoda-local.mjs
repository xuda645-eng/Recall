import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, access, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionClient = process.argv.includes('--production-client');
const target = resolve(process.argv.find((value, index) => index >= 2 && !value.startsWith('--'))
  ?? join(source, '../Recall-miaoda-migration'));
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== 'app_17hv4js1tsy') throw new Error('Not the authorized migration test app');
const requireTarget = createRequire(join(target, 'package.json'));
const dotenv = requireTarget('dotenv');
const env = { ...process.env };
dotenv.config({ path: join(target, '.env.local'), quiet: true, processEnv: env });
dotenv.config({ path: join(target, '.env'), quiet: true, processEnv: env });
if (env.CLIENT_BASE_PATH?.replace(/\/$/, '') !== '/app/app_17hv4js1tsy') {
  throw new Error('Local environment does not match the authorized application base path');
}
if (env.SUDA_WEBUSER) {
  try { JSON.parse(env.SUDA_WEBUSER); }
  catch {
    try { env.SUDA_WEBUSER = JSON.stringify(JSON.parse(env.SUDA_WEBUSER.replace(/\\"/g, '"'))); }
    catch { throw new Error('Platform identity environment is malformed; refresh it through the supported CLI'); }
  }
}
await access(join(target, 'dist/server/main.js'));
await access(join(target, 'node_modules/vite/bin/vite.js'));
if (productionClient) {
  const html = await readFile(join(target, 'dist/client/index.html'), 'utf8');
  if (html.includes('/@vite/client')) throw new Error('Production HTML required; build the client first');
}
for (const port of productionClient ? [8187, 3187, 4193] : [8187, 3187]) {
  const listener = createServer();
  await new Promise((ready, reject) => {
    listener.once('error', () => reject(new Error(`Local port ${port} is unavailable; no process was stopped`)));
    listener.listen(port, 'localhost', ready);
  });
  await new Promise((ready, reject) => listener.close(error => error ? reject(error) : ready()));
}
if (process.argv.includes('--check')) {
  console.log('Authorized local app, compiled server, identity format and free ports checked; no runtime started');
} else {
  Object.assign(env, { NODE_ENV: 'development', MIAODA_LOCAL_DEV: '1', SERVER_PORT: '3187', CLIENT_DEV_PORT: '8187' });
  const directory = await mkdtemp(join(tmpdir(), 'recall-miaoda-local-'));
  const path = join(directory, 'runtime.log');
  const log = openSync(path, 'wx', 0o600);
  const server = spawn(process.execPath, ['dist/server/main.js'], { cwd: target, env, stdio: ['ignore', log, log] });
  const clientArguments = productionClient
    ? [join(source, 'scripts/miaoda-production-client.mjs'), target]
    : ['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts', '--port', '8187', '--strictPort'];
  const client = spawn(process.execPath, clientArguments,
    { cwd: target, env, stdio: ['ignore', log, log] });
  closeSync(log);
  let stopping = false;
  const stop = () => { stopping = true; server.kill('SIGTERM'); client.kill('SIGTERM'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  for (const child of [server, client]) {
    child.on('error', () => { process.exitCode = 1; stop(); });
    child.on('exit', (code, signal) => {
      if (!stopping && (code || signal)) process.exitCode = 1;
      stop();
    });
  }
  console.log(`Local runtime starting at http://localhost:8187/app/app_17hv4js1tsy/recall/; private log: ${path}`);
}
