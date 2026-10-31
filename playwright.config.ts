import { defineConfig } from "@playwright/test";

const buildMode = process.env.RECALL_BUILD_MODE === "pages" ? "pages" : "production";
const localURL = `http://127.0.0.1:4193/${buildMode === "pages" ? "Recall/" : ""}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "memory-workspace.spec.ts",
  timeout: process.env.RECALL_URL ? 120000 : 30000,
  retries: 0,
  use: {
    baseURL: process.env.RECALL_URL || localURL,
    headless: true,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  },
  projects: [
    { name: "iphone15-chromium", use: { browserName: "chromium", launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: "iphone15-webkit", use: { browserName: "webkit", launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: process.env.RECALL_URL ? undefined : {
    command: `pnpm exec vite build --mode ${buildMode} && pnpm exec vite preview --mode ${buildMode} --host 127.0.0.1 --port 4193 --strictPort`,
    url: localURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
