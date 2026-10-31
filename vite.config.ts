import path from "node:path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { createBuildInfo } from "./src/lib/build-version";

const buildInfo = createBuildInfo(new Date(), process.env.RECALL_BUILD_VERSION);
const versionJSON = JSON.stringify(buildInfo);

export default defineConfig(({ mode }) => {
  const base = mode === "pages" ? "/Recall/" : "/";
  return {
    base,
    define: { __RECALL_BUILD_INFO__: versionJSON },
    plugins: [{
      name: "recall-build-version",
      generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: versionJSON }); },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== `${base}version.json`) { next(); return; }
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(versionJSON);
        });
      },
    }, react(), VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      workbox: { clientsClaim: true, globPatterns: ["**/*.{js,css,html,svg,png,woff2}"], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, navigateFallbackDenylist: [/^\/api/] },
      manifest: {
        name: "Recall - 记忆卡片与间隔复习", short_name: "Recall",
        description: "个人记忆卡片，多级整理与间隔复习，内容保存在本机。",
        theme_color: "#353532", background_color: "#f5f4ee",
        display: "standalone", orientation: "portrait", scope: base, start_url: base,
        lang: "zh-CN", categories: ["education", "productivity"],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: `${base}icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    })],
    build: { target: "es2021", rollupOptions: { output: { manualChunks: undefined } } },
    optimizeDeps: {}, resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  };
});
