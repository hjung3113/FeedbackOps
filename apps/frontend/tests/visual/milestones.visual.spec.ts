import { installMockApi } from './support/mock-api';
import { expect, test } from './support/visual-test';

// #514 B2c — /tasks?view=milestones list: empty copy, status tabs (no
// Blocked), populated rows, and the summary strip asserted as text through
// installMockApi. B2-pixel adds the expectVisual calls when the conductor
// generates PNGs; this spec does not own screenshots.
test.describe('/tasks?view=milestones visual harness', () => {
  test('mounts exactly one list shell', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);
  });

  test('renders the empty copy and the four status tabs without Blocked', async ({ page }) => {
    await installMockApi(page, { milestones: 'empty' });
    await page.goto('/tasks?view=milestones');

    await expect(page.getByText('표시할 milestone 이 없습니다.')).toBeVisible();
    for (const label of ['All', 'In progress', 'Planning', 'Released']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: /Blocked/ })).toHaveCount(0);
  });

  test('renders populated rows, tab counts, and the summary strip', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');

    const ssoRow = page.locator('[role="button"]', { hasText: 'MLS-1021' });
    await expect(ssoRow).toContainText('SSO Stabilization');
    await expect(ssoRow).toContainText('In progress');
    await expect(ssoRow).toContainText('Power BI');
    await expect(ssoRow).toContainText('Product Usage');
    await expect(ssoRow).toContainText('0/1 released');
    await expect(ssoRow).toContainText('2026-06-15');

    const uxRow = page.locator('[role="button"]', { hasText: 'MLS-1018' });
    await expect(uxRow).toContainText('Q1 UX Polish');
    await expect(uxRow).toContainText('Released');

    // Tab counts derive from the unfiltered list fixture (5 milestones:
    // 2 in progress, 2 planning, 1 released).
    await expect(page.getByRole('tab', { name: /^All/ })).toContainText('5');
    await expect(page.getByRole('tab', { name: /^In progress/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /^Planning/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /^Released/ })).toContainText('1');

    const summary = page.getByTestId('milestones-summary');
    await expect(summary).toContainText('Milestones');
    await expect(summary).toContainText('Tasks in flight');
    await expect(summary).toContainText('Evidence linked');
    await expect(summary).toContainText('Released');
    await expect(summary).toContainText('Schedule risk · mini-timeline 우측 표시');
    await expect(page.getByTestId('milestone-summary-evidence-linked')).toHaveText('0');
  });
});
