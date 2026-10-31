export function assertBrowserLaunchAllowed({ platform = process.platform, sandbox = process.env.CODEX_SANDBOX } = {}) {
  if (platform === 'darwin' && sandbox === 'seatbelt') {
    throw new Error(
      'RECALL_BROWSER_SANDBOX: Browser launch blocked before starting Chromium/WebKit. ' +
      'macOS GUI registration is unavailable in the Codex Seatbelt sandbox and can cause repeated crash dialogs. ' +
      'Rerun this exact command with sandbox_permissions=require_escalated, or run it in a normal macOS Terminal. ' +
      'Do not unset CODEX_SANDBOX, retry inside node_repl, disable macOS crash reporting, or mark this check as passed.',
    );
  }
}

export async function verifyBrowserRuntime(config, browserTypes) {
  assertBrowserLaunchAllowed();
  const engines = browserTypes ?? await import('@playwright/test');
  for (const project of config.projects) {
    const browserName = project.use.browserName ?? 'chromium';
    let browser;
    try {
      browser = await engines[browserName].launch({
        ...project.use.launchOptions,
        channel: project.use.channel,
        headless: project.use.headless ?? true,
        timeout: 15000,
      });
      const context = await browser.newContext({
        viewport: project.use.viewport,
        deviceScaleFactor: project.use.deviceScaleFactor,
        isMobile: project.use.isMobile,
        hasTouch: project.use.hasTouch,
      });
      const page = await context.newPage();
      await page.setContent('<title>Recall browser preflight</title>', { timeout: 5000 });
    } catch (cause) {
      throw new Error(
        `RECALL_BROWSER_PREFLIGHT: ${project.name} failed before test workers started. ` +
        'Fix browser installation/launch permissions before rerunning; no tests passed and no automatic retry was attempted.',
        { cause },
      );
    } finally {
      await browser?.close();
    }
  }
}
