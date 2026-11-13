import path from 'node:path';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createBuildInfo, createVersionMetadata } from './src/lib/build-version';

const base = '/app/app_17hv4js1tsy/recall/';
const build = createBuildInfo();
const assets = ['favicon.svg', 'pwa-viewport.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

export default defineConfig({
  base,
  publicDir: false,
  define: {
    __RECALL_BUILD_INFO__: JSON.stringify(build),
    'import.meta.env.VITE_RECALL_LOCAL_PREVIEW': JSON.stringify('1'),
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [react(), {
    name: 'recall-miaoda-local-assets',
    generateBundle() {
      for (const file of assets) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(path.resolve('public', file)) });
      }
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(createVersionMetadata(build)) });
    },
  }, VitePWA({
    strategies: 'injectManifest',
    srcDir: 'miaoda/worker',
    filename: 'sw.js',
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      name: 'Recall - Local Migration', short_name: 'Recall',
      display: 'standalone', orientation: 'portrait', lang: 'zh-CN',
      theme_color: '#4f604a', background_color: '#f5f1e9', scope: base, start_url: base,
      icons: [
        { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      rollupFormat: 'iife',
      globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
  })],
  build: {
    outDir: 'dist-miaoda-client',
    target: 'es2021',
    cssCodeSplit: false,
    rollupOptions: {
      input: { offline: path.resolve('miaoda-client.html'), 'recall-pwa': path.resolve('src/miaoda-client/entry.tsx') },
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: '[name].js',
        assetFileNames: asset => asset.names.some(name => name.endsWith('.css'))
          ? 'recall-pwa.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
