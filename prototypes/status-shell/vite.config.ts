import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import productionConfig from '../../vite.config';
import { createSeedSnapshot } from '../../src/data/seed';

const probeDirectory = fileURLToPath(new URL('./', import.meta.url));
const localAsset = (name: string) => readFileSync(`${probeDirectory}site/${name}`);
const seed = createSeedSnapshot(new Date('2026-11-01T00:00:00.000Z'));
const snapshot = {
  ...seed,
  decks: seed.decks.slice(0, 2).map((deck, index) => ({ ...deck, id: `probe-deck-${index}`, name: `合成对照组 ${index + 1}`, description: '非真实卡片', parentId: null })),
  cards: Array.from({ length: 12 }, (_, index) => ({
    ...seed.cards[0], id: `probe-card-${index}`, deckId: `probe-deck-${index % 2}`,
    front: `对照问题 ${index + 1}：如何检查理解？`, back: '合上材料，用自己的话复述，再回到原文检查。这是合成示例。',
    hint: '', tags: [], state: 'new', lastReviewDate: null, nextReviewDate: '2026-10-01T00:00:00.000Z',
    reps: 0, lapses: 0, stability: 0, difficulty: 0, learningSteps: 0, scheduledDays: 0,
  })),
  reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true },
};
const probePlugin: Plugin = {
  name: 'isolated-production-shell-probe',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html
        .replace('<head>', '<head><script src="/probe-boot.js"></script><script src="/probe-data.js"></script><script src="/probe-controls.js" defer></script>')
        .replace(/<title>.*?<\/title>/, '<title>Recall 完整壳对照 - 仅合成数据</title>')
        .replace(/<meta name="apple-mobile-web-app-title"[^>]*>/, '<meta name="apple-mobile-web-app-title" content="Recall 完整壳对照">')
        .replace(/<link rel="apple-touch-icon"[^>]*>/, '<link rel="apple-touch-icon" href="/probe-icon-192.png">')
        .replace(/<link rel="manifest"[^>]*>/g, '')
        .replace('</head>', '<link rel="manifest" href="/probe.webmanifest"><meta name="robots" content="noindex,nofollow"></head>');
    },
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'probe-data.js', source: `if(document.documentElement.dataset.shellProbe&&!localStorage.getItem('recall.snapshot.v1')){localStorage.setItem('recall.snapshot.v1',${JSON.stringify(JSON.stringify(snapshot))});}` });
    for (const fileName of ['probe-boot.js', 'probe-controls.js', 'probe.webmanifest', '_headers', '404.html']) {
      this.emitFile({ type: 'asset', fileName, source: localAsset(fileName) });
    }
    for (const size of [192, 512]) {
      this.emitFile({ type: 'asset', fileName: `probe-icon-${size}.png`, source: readFileSync(`${probeDirectory}../status-edge/site/icon-${size}.png`) });
    }
  },
};

export default defineConfig(async environment => {
  const config = typeof productionConfig === 'function' ? await productionConfig(environment) : productionConfig;
  return mergeConfig(config, {
    plugins: [probePlugin],
    build: { outDir: 'dist/status-shell' },
  });
});
