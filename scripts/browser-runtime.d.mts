import type { BrowserType, FullConfig } from '@playwright/test';

export function assertBrowserLaunchAllowed(options?: { platform?: string; sandbox?: string }): void;
export function verifyBrowserRuntime(config: FullConfig, browserTypes?: Record<string, BrowserType>): Promise<void>;
