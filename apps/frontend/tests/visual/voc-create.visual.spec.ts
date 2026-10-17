import { similarityPreviewAvailabilityResponseSchema } from '@fops/shared';
import { expect, test } from './support/visual-test';

import { VOC_CREATE_IDS } from './fixtures/voc-create';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('VOC create pre-submit similar VOC visual harness (#293)', () => {
  test('unconfigured preview keeps only the develop create right-column cards', async ({
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
    await page.route('**/vocs/similarity-preview/availability', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          similarityPreviewAvailabilityResponseSchema.parse({
            available: false,
            reason: 'provider_disabled',
          }),
        ),
      }),
    );
    const availabilityResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/vocs/similarity-preview/availability',
    );
    await page.goto(`/vocs?action=create&managedSystem=${VOC_CREATE_IDS.managedSystem}`);
    expect((await availabilityResponse).status()).toBe(200);
    const peer = page.getByTestId('similar-voc-panel');
    await expect(peer).toContainText('Tableau 새로고침 실패');
    // The create right column: Reporter / heuristic, with no placeholder. The severity note is
    // a help line under the title since #1236, not a right-column card.
    const rightColumn = peer.locator('..');
    await expect(rightColumn.locator(':scope > *')).toHaveCount(2);
    await expect(rightColumn).toContainText('제출자');
    await expect(rightColumn).not.toContainText('심각도 안내');
    await expect(page.getByTestId('semantic-voc-panel')).toHaveCount(0);
    expect(previewPosts).toHaveLength(0);
  });
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
