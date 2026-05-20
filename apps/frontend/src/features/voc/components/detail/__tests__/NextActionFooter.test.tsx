import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NextActionFooter } from '../NextActionFooter';
import { DETAIL_ENVELOPE } from './_fixtures';

describe('<NextActionFooter>', () => {
  it('shows "다음 액션 없음" when next_actions is empty', () => {
    render(<NextActionFooter voc={{ ...DETAIL_ENVELOPE, next_actions: [] }} />);
    expect(screen.getByText('다음 액션 없음')).toBeInTheDocument();
  });

  it('renders primary action button when next_actions has one entry', () => {
    const actions = [{ id: 'a1', label: '검토 시작', available: true, primary: true }];
    render(<NextActionFooter voc={{ ...DETAIL_ENVELOPE, next_actions: actions }} />);
    expect(screen.getByRole('button', { name: '검토 시작' })).toBeInTheDocument();
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
    render(<NextActionFooter voc={{ ...DETAIL_ENVELOPE, next_actions: ['bad', 42, null] }} />);
    expect(screen.getByText('다음 액션 없음')).toBeInTheDocument();
  });
});
