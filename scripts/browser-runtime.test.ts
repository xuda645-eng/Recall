// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import type { BrowserType, FullConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed, verifyBrowserRuntime } from './browser-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('browser launch environment', () => {
  it('rejects macOS Seatbelt without starting a browser', () => {
    expect(() => assertBrowserLaunchAllowed({ platform: 'darwin', sandbox: 'seatbelt' }))
      .toThrow('RECALL_BROWSER_SANDBOX');
    expect(() => assertBrowserLaunchAllowed({ platform: 'darwin', sandbox: 'seatbelt' }))
      .toThrow('sandbox_permissions=require_escalated');
  });

  it.each(['linux', 'win32'])('does not block %s CI', platform => {
    expect(() => assertBrowserLaunchAllowed({ platform, sandbox: 'seatbelt' })).not.toThrow();
  });

  it('allows an approved macOS process without the sandbox marker', () => {
    expect(() => assertBrowserLaunchAllowed({ platform: 'darwin', sandbox: '' })).not.toThrow();
  });

  it('uses the actual process marker by default', () => {
    vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
    expect(() => assertBrowserLaunchAllowed({ platform: 'darwin' })).toThrow('RECALL_BROWSER_SANDBOX');
  });

  it.each([
    ['scripts/run-playwright.mjs'],
    ['scripts/run-playwright.mjs', '--config', 'prototypes/missing.config.ts'],
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.ts'],
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'e2e/cloud.config.ts'],
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'e2e/weread-online.config.ts'],
    ['scripts/verify-mobile.mjs'],
    ['scripts/verify-chinese-mobile.mjs'],
    ['scripts/take-screenshots.js'],
  ])('blocks the real entry %j before launch', (...args: string[]) => {
    if (process.platform !== 'darwin') return;
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env: { ...process.env, CODEX_SANDBOX: 'seatbelt' },
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RECALL_BROWSER_SANDBOX');
    expect(result.stdout).not.toContain('Running ');
  });
});

function createEngine() {
  const page = { setContent: vi.fn().mockResolvedValue(undefined) };
  const context = { newPage: vi.fn().mockResolvedValue(page) };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { launch: vi.fn().mockResolvedValue(browser), browser, page };
}

function configuration() {
  return {
    projects: ['chromium', 'webkit'].map(browserName => ({
      name: `iphone15-${browserName}`,
      use: {
        browserName,
        launchOptions: { executablePath: `/test/${browserName}`, timeout: 90000 },
        headless: true,
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    })),
  } as FullConfig;
}

describe('browser startup preflight', () => {
  it('renders an isolated iPhone 15 page once per engine and closes both', async () => {
    vi.stubEnv('CODEX_SANDBOX', '');
    const chromium = createEngine();
    const webkit = createEngine();
    await verifyBrowserRuntime(configuration(), { chromium, webkit } as unknown as Record<string, BrowserType>);
    for (const engine of [chromium, webkit]) {
      expect(engine.launch).toHaveBeenCalledTimes(1);
      expect(engine.launch).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000, headless: true }));
      expect(engine.browser.newContext).toHaveBeenCalledWith({
        viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      });
      expect(engine.page.setContent).toHaveBeenCalledWith('<title>Recall browser preflight</title>', { timeout: 5000 });
      expect(engine.browser.close).toHaveBeenCalledTimes(1);
    }
  });

  it('fails once on startup error without launching later engines or retrying', async () => {
    vi.stubEnv('CODEX_SANDBOX', '');
    const chromium = createEngine();
    const webkit = createEngine();
    chromium.launch.mockRejectedValue(new Error('launch denied'));
    await expect(verifyBrowserRuntime(configuration(), { chromium, webkit } as unknown as Record<string, BrowserType>))
      .rejects.toThrow('RECALL_BROWSER_PREFLIGHT: iphone15-chromium');
    expect(chromium.launch).toHaveBeenCalledTimes(1);
    expect(webkit.launch).not.toHaveBeenCalled();
  });

  it('closes the browser when rendering fails and stops the suite', async () => {
    vi.stubEnv('CODEX_SANDBOX', '');
    const chromium = createEngine();
    const webkit = createEngine();
    chromium.page.setContent.mockRejectedValue(new Error('page crashed'));
    await expect(verifyBrowserRuntime(configuration(), { chromium, webkit } as unknown as Record<string, BrowserType>))
      .rejects.toMatchObject({ cause: { message: 'page crashed' } });
    expect(chromium.browser.close).toHaveBeenCalledTimes(1);
    expect(webkit.launch).not.toHaveBeenCalled();
  });

  it('checks the sandbox before calling any engine', async () => {
    if (process.platform !== 'darwin') return;
    vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
    const chromium = createEngine();
    await expect(verifyBrowserRuntime(configuration(), { chromium } as unknown as Record<string, BrowserType>))
      .rejects.toThrow('RECALL_BROWSER_SANDBOX');
    expect(chromium.launch).not.toHaveBeenCalled();
  });
});
