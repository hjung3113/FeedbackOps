import { RECOVERY_VISUAL_ID, type RecoveryVisualScenario } from './fixtures/recovery';
import { createIntegrationDashboardScenario } from './scenarios';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

for (const area of ['integration', 'home'] as const) {
  for (const state of (area === 'integration'
    ? ['active', 'resolved', 'hidden']
    : ['queue', 'active', 'history']) as RecoveryVisualScenario[]) {
    test(`${area} recovery ${state} at desktop 1440`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await installMockApi(page, {
        recovery: state,
        ...(area === 'home'
          ? { home: 'populated' as const }
          : { integrationDashboard: createIntegrationDashboardScenario('populated') }),
      });
      const params = new URLSearchParams();
      if (['active', 'resolved', 'hidden'].includes(state))
        params.set('selected', RECOVERY_VISUAL_ID);
      if (state === 'hidden') params.set('presentation', 'hidden');
      if (state === 'history') params.set('history', 'true');
      await page.goto(`/${area}?${params}`);
      await expect(page.getByTestId('recovery-queue')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.getByTestId('recovery-queue').scrollIntoViewIfNeeded();
      if (params.has('selected')) {
        const panel = page.getByTestId('recovery-panel');
        await expect(panel).toBeVisible();
        await expect(
          panel.getByRole('heading', { name: '월간 리포트 다운로드 오류' }),
        ).toBeVisible();
        if (state === 'hidden') await expect(panel.getByText('이번 항목 숨김')).toBeVisible();
        if (state === 'resolved')
          await expect(panel.getByText('원본 화면에서 처리됨', { exact: false })).toBeVisible();
      } else
        await expect(page.getByRole('button', { name: /VOC 담당자 배정이 필요/ })).toBeVisible();
      // The queue scrolls its selected row into view once data lands; settle on one final position.
      await page
        .getByTestId('recovery-queue')
        .evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await expectVisual(page, page.locator('[data-app-frame]'), `${area}-recovery-${state}.png`);
    });
  }
}
