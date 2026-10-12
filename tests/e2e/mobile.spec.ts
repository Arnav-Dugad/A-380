import { expect, test } from '@playwright/test';
import { openApp, waitFor } from './helpers';

test('mobile layout: bottom navigation, bottom sheet and touch interaction', async ({ page }) => {
  await openApp(page);
  const nav = page.getByRole('navigation', { name: 'Primary' }).last();
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: /Systems/ }).tap();
  await expect(page.getByRole('heading', { name: 'Aircraft systems' })).toBeVisible();
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.screenshot({ path: 'test-results/07-mobile.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('mobile sheet snaps between peek, half and full', async ({ page }) => {
  await openApp(page);
  const sheet = page.locator('[data-sheet]');
  await expect(sheet).toHaveAttribute('data-sheet', 'half');
  // tapping the grab handle steps up; from full it collapses to peek
  await page.getByRole('button', { name: 'Expand panel' }).tap();
  await expect(sheet).toHaveAttribute('data-sheet', 'full');
  await page.getByRole('button', { name: 'Collapse panel' }).tap();
  await expect(sheet).toHaveAttribute('data-sheet', 'peek');
  // switching section restores that section's default height
  await page.getByRole('navigation', { name: 'Primary' }).last().getByRole('button', { name: /Systems/ }).tap();
  await expect(sheet).toHaveAttribute('data-sheet', 'half');
});

test('touch flight controls: thrust slider drives the engines', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__a380!.ui.getState().set({ flightScenario: 'ready' }));
  await page.getByRole('navigation', { name: 'Primary' }).last().getByRole('button', { name: /Flight/ }).tap();
  const thrust = page.getByRole('slider', { name: 'Thrust levers' });
  await expect(thrust).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('application', { name: 'Stick' })).toBeVisible();
  const b = (await thrust.boundingBox())!;
  // drag the thrust lever to the top (TOGA)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 2, { steps: 6 });
  await page.mouse.up();
  await waitFor(page, () => window.__a380!.systems.state.engines[0]!.lever > 0.95, 60_000);
  await page.screenshot({ path: 'test-results/08-mobile-flight.png' });
});
