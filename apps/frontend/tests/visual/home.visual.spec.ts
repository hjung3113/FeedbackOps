import {
  homeEmptyVisualSnapshot,
  homeInboxPopulatedVisualSnapshot,
  homeInboxSubjectReferencesVisualSnapshot,
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

  test('renders subject references with allowed and unavailable titles at 1440 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await installMockApi(page, { home: 'populated', notifications: 'subject-references' });
    await page.goto('/home?tab=inbox');
    await page.getByRole('radio', { name: '전체' }).click();

    const allowedRow = page.getByTestId('home-inbox-row-77777777-7777-4777-8777-777777777777');
    const unavailableRow = page.getByTestId('home-inbox-row-dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    await expect(allowedRow.getByText('VOC-2842')).toBeVisible();
    await expect(
      allowedRow.getByText(
        'The export report takes several minutes to load when a saved filter contains many linked analytics areas',
      ),
    ).toBeVisible();
    await expect(unavailableRow).toContainText('접근할 수 없는 항목');
    await expect(unavailableRow).not.toContainText('VOC-2842');
    await expect(unavailableRow).not.toContainText('Task Request');
    await expect(
      page.getByTestId('home-inbox-row-99999999-9999-4999-8999-999999999999'),
    ).toContainText('REQ-42');
    await expect(
      page.getByTestId('home-inbox-row-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).toContainText('TASK-901');
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      homeInboxSubjectReferencesVisualSnapshot,
    );
  });

  // #888: Radix <Tabs> wraps the PageShell. Without flex sizing it grew to the
  // content height, the document scrolled, and the rail and sidebar slid up.
  test('scrolls a long dashboard inside the page, not the document', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await installMockApi(page, { home: 'populated' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    // The [data-shell="page"] > .overflow-y-auto lookup depends on PageShell's
    // DOM structure (packages/ui/src/layout/PageShell.tsx); polling the page
    // overflow also waits for the populated queues to render.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const shellScroll = document.querySelector('[data-shell="page"] > .overflow-y-auto');
          return shellScroll ? shellScroll.scrollHeight - shellScroll.clientHeight : 0;
        }),
      )
      .toBeGreaterThan(0);
    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(documentOverflow).toBe(0);
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
        '운영 큐와 커버리지는 Managed System 담당 범위가 있을 때만 표시됩니다. 지금은 나에게 배정된 작업만 보입니다.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '복구 · 후속 조치 큐' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '커버리지 신호' })).toHaveCount(0);
    await expectVisual(page, page.locator('[data-app-frame]'), homeUnscopedVisualSnapshot);
  });

  test('inbox-high-no-link-selected', async ({ page }) => {
    await installMockApi(page, { inboxHighNoLink: true });
    await page.goto('/vocs?view=inbox&tab=high-no-link');
    const tab = page.getByRole('tab', { name: '높음 · 연결 없음' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      inboxHighNoLinkSelectedVisualSnapshot,
    );
  });
});
