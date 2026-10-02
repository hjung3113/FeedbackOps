import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { SurveyStatusConfirmationDialog } from '../SurveyStatusConfirmationDialog';

function renderDialog(error: ApiError | null): void {
  render(
    <SurveyStatusConfirmationDialog
      open
      target="open"
      isPending={false}
      error={error}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
}

describe('SurveyStatusConfirmationDialog error copy (#561)', () => {
  it('uses secondary styling for its cancel action', () => {
    renderDialog(null);

    expect(screen.getByRole('button', { name: '취소' })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  });

  it.each([
    ['a network TypeError', new TypeError('Failed to fetch')],
    ['a non-JSON body SyntaxError', new SyntaxError('Unexpected token <')],
  ])('shows the generic failure copy for %s instead of crashing', (_label, error) => {
    // The mutation error type claims ApiError, but apiClient passes these through.
    renderDialog(error as unknown as ApiError);

    expect(screen.getByRole('alert')).toHaveTextContent(
      '상태 변경에 실패했습니다. 다시 시도하세요.',
    );
  });

  it('still maps a validation envelope to the specific copy', () => {
    renderDialog(
      new ApiError(422, {
        code: 'validation.failed',
        message: 'invalid',
        detail: { fields: [{ path: ['questions'], code: 'required' }] },
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Survey 시작 전에 질문을 하나 이상 추가해야 합니다.',
    );
  });
});
