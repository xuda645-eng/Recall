import path from 'node:path';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createBuildInfo, createVersionMetadata } from './src/lib/build-version';

const build = createBuildInfo();
const assets = ['favicon.svg', 'pwa-viewport.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon-1024.png'];

export default defineConfig({
  base: './',
  publicDir: false,
  define: {
    __RECALL_BUILD_INFO__: JSON.stringify(build),
    'import.meta.env.VITE_RECALL_LOCAL_PREVIEW': JSON.stringify('1'),
    'import.meta.env.VITE_RECALL_MIAODA_LEARNING': JSON.stringify('1'),
  },
  resolve: { alias: {
    '@': path.resolve(__dirname, 'src'),
    'virtual:pwa-register/react': path.resolve(__dirname, 'src/miaoda-client/preview-worker.ts'),
  } },
  plugins: [react(), {
    name: 'recall-miaoda-learning-assets',
    generateBundle() {
      for (const file of assets) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(path.resolve(file === 'favicon.svg' || file.startsWith('icons/') ? 'miaoda' : 'public', file)) });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(createVersionMetadata(build)) });
    },
  }],
  build: {
    outDir: 'dist-miaoda-learning', target: 'es2021', cssCodeSplit: false, assetsInlineLimit: 0,
    rollupOptions: {
      input: { 'recall-pwa': path.resolve('src/miaoda-client/entry.tsx') },
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: '[name].js',
        assetFileNames: asset => asset.names.some(name => name.endsWith('.css'))
          ? 'recall-pwa.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
