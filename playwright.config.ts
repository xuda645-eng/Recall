import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "memory-workspace.spec.ts",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.RECALL_URL || "http://127.0.0.1:4193/Recall/",
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
    command: "pnpm exec vite build --mode pages && pnpm exec vite preview --mode pages --host 127.0.0.1 --port 4193 --strictPort",
    url: "http://127.0.0.1:4193/Recall/",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
