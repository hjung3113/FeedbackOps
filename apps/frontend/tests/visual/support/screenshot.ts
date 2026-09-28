import { type Locator, type Page, expect } from '@playwright/test';

export async function expectVisual(page: Page, finalState: Locator, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(finalState).toBeVisible();
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0002,
  });
}
