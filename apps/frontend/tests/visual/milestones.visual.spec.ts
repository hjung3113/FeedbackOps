import { installMockApi } from './support/mock-api';
import { expect, test } from './support/visual-test';

// #514 B2a — mount commit: /tasks?view=milestones renders the list shell.
// B2c extends this spec with empty-copy and populated-row assertions;
// B2-pixel adds the expectVisual calls when the conductor generates PNGs.
test.describe('/tasks?view=milestones visual harness', () => {
  test('mounts exactly one list shell', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);
  });
});
