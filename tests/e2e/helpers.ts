import { expect, type Page } from '@playwright/test';

export interface Issues {
  errors: string[];
  failed: string[];
}

/** Open the app, wait for the aircraft and finish the intro; collect console errors and failed requests. */
export async function openApp(page: Page, opts: { skipIntro?: boolean } = {}): Promise<Issues> {
  const issues: Issues = { errors: [], failed: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') issues.errors.push(m.text());
  });
  page.on('pageerror', (e) => issues.errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) issues.failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => issues.failed.push(`failed ${r.url()}`));
  // Functional tests run with the Balanced preset: headless Chromium renders on the CPU (SwiftShader).
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('a380-prefs-v1')) localStorage.setItem('a380-prefs-v1', JSON.stringify({ state: { quality: 'balanced', env: 'studio', exposure: 1, audio: false, showStats: false }, version: 0 }));
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__a380?.ready(), null, { timeout: 120_000 });
  if (opts.skipIntro !== false) {
    await page.evaluate(() => window.__a380!.ui.getState().set({ introDone: true }));
    await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
  }
  return issues;
}

/** Ignore benign WebGL/software-rendering warnings that only appear in headless SwiftShader. */
export function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !/GPU stall|SwiftShader|WebGL: INVALID_ENUM|Automatic fallback/i.test(e));
}

export async function waitFor<T>(page: Page, fn: () => T | Promise<T>, timeout = 60_000): Promise<void> {
  await page.waitForFunction(fn as () => unknown, null, { timeout, polling: 250 });
}
