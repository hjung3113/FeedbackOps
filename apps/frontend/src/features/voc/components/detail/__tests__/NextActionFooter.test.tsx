import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NextActionFooter } from '../NextActionFooter';
import { DETAIL_ENVELOPE } from './_fixtures';

describe('<NextActionFooter>', () => {
  it.each([
    { canCreateFinding: false, canRequestTask: false, visible: [] },
    { canCreateFinding: true, canRequestTask: false, visible: ['Finding 생성'] },
    { canCreateFinding: false, canRequestTask: true, visible: ['Task 요청'] },
    { canCreateFinding: true, canRequestTask: true, visible: ['Finding 생성', 'Task 요청'] },
  ])(
    'shows only actions allowed by the capability combination %#',
    ({ canCreateFinding, canRequestTask, visible }) => {
      render(
        <NextActionFooter
          voc={{ ...DETAIL_ENVELOPE, next_actions: [] }}
          {...(canCreateFinding
            ? { primaryAction: { label: 'Finding 생성', onClick: () => {} } }
            : {})}
          {...(canRequestTask
            ? { secondaryAction: { label: 'Task 요청', onClick: () => {} } }
            : {})}
        />,
      );

      for (const label of ['Finding 생성', 'Task 요청']) {
        expect(screen.queryByRole('button', { name: label }) !== null).toBe(
          visible.includes(label),
        );
      }
      expect(screen.queryByText('다음 액션 없음')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '추가 작업' })).not.toBeInTheDocument();
    },
  );

  it('keeps backend next_actions metadata without rendering an inert primary button', () => {
    const actions = [{ id: 'a1', label: '검토 시작', available: true, primary: true }];
    render(<NextActionFooter voc={{ ...DETAIL_ENVELOPE, next_actions: actions }} />);
    expect(screen.getByText('검토 시작')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '검토 시작' })).not.toBeInTheDocument();
  });

  it('shows +N more when there are additional actions', () => {
    const actions = [
      { id: 'a1', label: '검토 시작', available: true, primary: true },
      { id: 'a2', label: '담당자 지정', available: true, primary: false },
    ];
    render(<NextActionFooter voc={{ ...DETAIL_ENVELOPE, next_actions: actions }} />);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('ignores entries that do not match the NextAction shape', () => {
    const { container } = render(
      <NextActionFooter voc={{ ...DETAIL_ENVELOPE, next_actions: ['bad', 42, null] }} />,
    );
    expect(screen.queryByText('다음 액션 없음')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
