/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { InternalTaskBadge, type InternalTaskStatusEnum } from '../InternalTaskBadge.js';

const cases: Array<{ status: InternalTaskStatusEnum; label: string }> = [
  { status: 'backlog',  label: 'Backlog' },
  { status: 'todo',     label: 'Todo' },
  { status: 'doing',    label: 'Doing' },
  { status: 'review',   label: 'Review' },
  { status: 'done',     label: 'Done' },
  { status: 'released', label: 'Released' },
  { status: 'reopened', label: 'Reopened' },
];

describe('InternalTaskBadge', () => {
  cases.forEach(({ status, label }) => {
    it(`renders English label "${label}" for status="${status}"`, () => {
      render(<InternalTaskBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`sets data-token to --status-internal-${status}`, () => {
      const { container } = render(<InternalTaskBadge status={status} />);
      const badge = container.querySelector(`[data-token="--status-internal-${status}"]`);
      expect(badge).not.toBeNull();
    });
  });
});
