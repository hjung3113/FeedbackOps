import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

// #611 — the palette is app-shell chrome, captured over the Home action
// dashboard. jsdom covers the behavior matrix; these two screenshots pin the
// prototype panel (docs/design-prototype/cmdk.jsx + probe-cmdk.png): default
// grouped list, and the 열기 row for a display-id query.

test.describe('/home command palette', () => {
  test('palette open with the default grouped list', async ({ page }) => {
    await installMockApi(page, { home: 'populated' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();

    // The harness emulates Desktop Chrome on Windows (userAgentData.platform is
    // 'Windows'), so the app binds Ctrl+K regardless of the host OS (#611).
    await page.keyboard.press('Control+KeyK');
    const dialog = page.getByRole('dialog', { name: '명령 메뉴' });
    await expect(dialog).toBeVisible();

    await expectVisual(page, dialog, 'command-palette-open.png');
  });

  test('palette shows the 열기 row for a display-id query', async ({ page }) => {
    await installMockApi(page, { home: 'populated' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();

    await page.keyboard.press('Control+KeyK');
    const dialog = page.getByRole('dialog', { name: '명령 메뉴' });
    await expect(dialog).toBeVisible();

    await page.keyboard.type('voc-12');
    const openRecord = page.getByTestId('command-palette-open-record');
    await expect(openRecord).toBeVisible();
    await expect(openRecord).toContainText('VOC-12 열기');

    await expectVisual(page, dialog, 'command-palette-display-id.png');
  });
});
