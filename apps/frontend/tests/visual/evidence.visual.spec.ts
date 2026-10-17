import { EVIDENCE_VISUAL_ID } from './fixtures/evidence';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test('Evidence inventory: keyboard selection, focus return and shell-local scroll', async ({
  page,
}) => {
  await installMockApi(page, { evidence: 'normal' });
  await page.goto('/integration/evidence');
  const row = page.getByRole('button', { name: /월간 리포트 다운로드가 느려지고/ });
  await expect(row).toBeVisible();
  await expect(page.getByTestId('sidebar-nav-integration-evidence')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('rail-admin')).toBeVisible();
  await expectVisual(page, page.locator('[data-app-frame]'), 'evidence-normal.png');
  await row.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId('evidence-panel');
  await expect(panel.getByRole('link', { name: 'Finding 보기' })).toHaveAttribute(
    'href',
    /selected=b2222222/,
  );
  await expect(page.getByTestId('rail-admin')).toBeVisible();
  await expectVisual(page, page.locator('[data-app-frame]'), 'evidence-selected.png');
  const panelScroll = panel.locator('div.overflow-y-auto');
  await panelScroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(() => panelScroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await expect(row).toBeFocused();
  // ListShell's last child owns list scroll; document scroll must stay fixed.
  const scrollRoot = page.locator('[data-shell="list"] > div').last();
  await scrollRoot.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(() => scrollRoot.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
});
for (const scenario of ['withheld', 'empty', 'error'] as const) {
  test(`Evidence ${scenario}`, async ({ page }) => {
    await installMockApi(page, { evidence: scenario });
    await page.goto(
      scenario === 'withheld'
        ? `/integration/evidence?selected=${EVIDENCE_VISUAL_ID}`
        : '/integration/evidence',
    );
    await expect(
      page
        .getByText(
          scenario === 'withheld'
            ? '원본 접근 권한 또는 승인 상태가 변경되어 내용을 표시할 수 없습니다.'
            : scenario === 'empty'
              ? '표시할 Evidence가 없습니다.'
              : 'Evidence를 불러오지 못했습니다.',
        )
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId('rail-admin')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), `evidence-${scenario}.png`);
  });
}

test('Evidence scoped-search-empty offers the all-source search', async ({ page }) => {
  await installMockApi(page, { evidence: 'scoped-search-empty' });
  await page.goto('/integration/evidence?source=voc&q=다운로드');

  await expect(page.getByText('조건에 맞는 Evidence가 없습니다.')).toBeVisible();
  const searchAll = page.getByRole('button', { name: '전체에서 검색' });
  await expect(searchAll).toBeVisible();
  await expect(page.getByRole('button', { name: '조건 초기화' })).toBeVisible();
  await expectVisual(page, page.locator('[data-app-frame]'), 'evidence-scoped-search-empty.png');

  // The action reruns the same query without source_type instead of being a dead control.
  await searchAll.click();
  await expect(
    page.getByRole('button', { name: /다운로드 실패는 월간 리포트 생성 지연/ }),
  ).toBeVisible();
  await expect(page.getByText('조건에 맞는 Evidence가 없습니다.')).toBeHidden();
});
