import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

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
