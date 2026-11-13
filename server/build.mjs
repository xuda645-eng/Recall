import { build } from 'tsup';

await build({
  entry: ['server/application.ts', 'server/postgres.ts', 'server/object-media.ts', 'server/miaoda-file-storage.ts'],
  outDir: 'dist-server',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  splitting: false,
  clean: true,
  sourcemap: false,
  outExtension: () => ({ js: '.mjs' }),
});
