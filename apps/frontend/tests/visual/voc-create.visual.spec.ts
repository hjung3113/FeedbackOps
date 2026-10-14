import { expect, test } from './support/visual-test';

import { VOC_CREATE_IDS } from './fixtures/voc-create';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('VOC create pre-submit similar VOC visual harness (#293)', () => {
  test('shows selected Managed System peers in the create right column', async ({ page }) => {
    const previewPosts: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/vocs/similarity-preview'
      )
        previewPosts.push(request.url());
    });
    await installMockApi(page, { vocCreate: true, role: 'user' });
    await page.goto(`/vocs?action=create&managedSystem=${VOC_CREATE_IDS.managedSystem}`);

    const panel = page.getByTestId('similar-voc-panel');
    // #592: the pre-submit panel shows at most three peers, so its title carries no count.
    await expect(panel).toContainText('같은 Managed System의 최근 VOC');
    await expect(panel).toContainText('Tableau 새로고침 실패');
    await expect(panel).toContainText('VOC-2931');
    await expect(page.getByTestId('semantic-voc-panel')).toContainText('유사 VOC 추천');
    await expect(page.getByRole('button', { name: '유사 VOC 확인' })).toBeDisabled();
    await expectVisual(
      page,
      page.locator('#voc-create-form').locator('..').locator('..'),
      'voc-create.png',
    );
    expect(previewPosts).toHaveLength(0);
  });
  test('shows semantic candidates only after one explicit check on a valid draft', async ({
    page,
  }) => {
    const previewPosts: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/vocs/similarity-preview'
      )
        previewPosts.push(request.url());
    });
    await installMockApi(page, { vocCreate: true, role: 'user' });
    await page.goto(`/vocs?action=create&managedSystem=${VOC_CREATE_IDS.managedSystem}`);
    await page.getByRole('textbox', { name: '제목', exact: true }).fill('대시보드 갱신 오류');
    await page
      .locator('#voc-create-form .ProseMirror')
      .first()
      .fill('대시보드가 새로고침 후에도 이전 값을 표시합니다.');
    const check = page.getByRole('button', { name: '유사 VOC 확인' });
    await expect(check).toBeEnabled();
    expect(previewPosts).toHaveLength(0);
    await check.click();
    await expect(
      page.getByTestId('semantic-voc-panel').getByRole('link', { name: /이전 대시보드 갱신 오류/ }),
    ).toBeVisible();
    await expect(check).toBeFocused();
    await expect(page.getByTestId('similar-voc-panel')).toContainText(
      '같은 Managed System의 최근 VOC',
    );
    expect(previewPosts).toHaveLength(1);
    await expectVisual(
      page,
      page.locator('#voc-create-form').locator('..').locator('..'),
      'voc-create-semantic-result.png',
    );
  });
});
