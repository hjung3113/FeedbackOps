import {
  homeEmptyVisualSnapshot,
  homeInboxPopulatedVisualSnapshot,
  homeUnscopedVisualSnapshot,
  homeVisualSnapshot,
  homeZeroQueuesVisualSnapshot,
  inboxHighNoLinkSelectedVisualSnapshot,
} from './fixtures/home';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/home visual harness', () => {
  test('renders the populated action dashboard', async ({ page }) => {
    await installMockApi(page, { home: 'populated' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeVisualSnapshot);
  });

  test('renders the populated inbox tab', async ({ page }) => {
    await installMockApi(page, { home: 'populated', notifications: 'populated' });
    await page.goto('/home?tab=inbox');
    await expect(page.getByTestId('home-inbox-list')).toBeVisible();
    await expect(
      page.getByTestId('home-inbox-row-11111111-1111-4111-8111-111111111111'),
    ).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeInboxPopulatedVisualSnapshot);
  });

  // #280 removed the dead My Work entry point, not the panel — the panel still
  // renders assigned Tasks and pending Requests, and this is its empty state.
  test('renders the empty assigned-work state', async ({ page }) => {
    await installMockApi(page, { home: 'empty' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeEmptyVisualSnapshot);
  });

  test('renders positive queues with zero queues in a compact strip', async ({ page }) => {
    await installMockApi(page, { home: 'zero-queues' });
    await page.goto('/home');
    await expect(page.getByTestId('home-zero-queues')).toContainText('처리할 항목 없음');
    await expect(page.getByTestId('home-zero-queue-unassigned-voc')).toHaveAttribute(
      'href',
      '/vocs?view=triage&tab=unassigned',
    );
    await expectVisual(page, page.locator('[data-app-frame]'), homeZeroQueuesVisualSnapshot);
  });

  test('hides out-of-scope queue sections for a non-admin actor', async ({ page }) => {
    await installMockApi(page, { home: 'unscoped', role: 'user' });
    await page.goto('/home');
    await expect(
      page.getByText(
        '운영 큐와 Coverage는 Managed System 담당 범위가 있을 때만 표시됩니다. 지금은 나에게 배정된 작업만 보입니다.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recovery & follow-up queues' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Coverage signals' })).toHaveCount(0);
    await expectVisual(page, page.locator('[data-app-frame]'), homeUnscopedVisualSnapshot);
  });

  test('inbox-high-no-link-selected', async ({ page }) => {
    await installMockApi(page, { inboxHighNoLink: true });
    await page.goto('/vocs?view=inbox&tab=high-no-link');
    const tab = page.getByRole('tab', { name: 'High · no link' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      inboxHighNoLinkSelectedVisualSnapshot,
    );
  });
});
