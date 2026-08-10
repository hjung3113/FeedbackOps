import { surveyVisualFixture, surveyVisualScenarios } from './fixtures/surveys';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/surveys visual harness', () => {
  for (const scenario of surveyVisualScenarios) {
    test(`renders ${scenario}`, async ({ page }) => {
      await installMockApi(page, {
        surveyScenario: scenario,
        role: scenario === 'no-permission' || scenario === 'empty-no-permission' ? 'user' : 'admin',
      });
      const isBuilder = ['builder', 'builder-dirty', 'builder-drag-over'].includes(scenario);
      const url =
        scenario === 'detail'
          ? `/surveys/${surveyVisualFixture.id}`
          : isBuilder
            ? `/surveys/${surveyVisualFixture.id}?builder=true`
            : '/surveys';
      await page.goto(url);

      if (scenario === 'builder-dirty') {
        const promptField = page.locator('#question-title');
        await expect(promptField).toHaveValue('리포트를 얼마나 자주 사용하시나요?');
        await promptField.fill('저장 전 수정한 질문입니다.');
        await expect(page.getByText('저장되지 않은 변경 사항')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();
      }
      if (scenario === 'builder-drag-over') {
        const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
        await page
          .getByTestId('survey-question-row-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
          .dispatchEvent('dragstart', { dataTransfer });
        const dragTarget = page.getByTestId(
          'survey-question-row-ffffffff-ffff-4fff-8fff-ffffffffffff',
        );
        await dragTarget.dispatchEvent('dragover', { dataTransfer });
        await expect(dragTarget).toHaveAttribute('data-drag-over', 'true');
      }
      if (scenario === 'create-dialog') {
        await page.getByTestId('survey-create-button').click();
        await expect(page.getByRole('dialog')).toBeVisible();
      }

      const target = isBuilder
        ? page.getByTestId('survey-builder')
        : scenario === 'create-dialog'
          ? page.getByRole('dialog')
          : scenario === 'detail'
            ? page.getByTestId('survey-detail')
            : scenario === 'empty-no-permission'
              ? page.getByTestId('survey-list')
              : scenario === 'error'
                ? page.getByTestId('survey-list-error')
                : page.getByTestId('survey-list');
      await expect(target).toBeVisible();
      await expectVisual(page, target, `surveys-${scenario}.png`);
    });
  }
});
