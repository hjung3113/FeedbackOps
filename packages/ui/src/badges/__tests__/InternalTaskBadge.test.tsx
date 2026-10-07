/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { InternalTaskBadge, type InternalTaskStatusEnum } from '../InternalTaskBadge.js';

const cases: Array<{ status: InternalTaskStatusEnum; label: string }> = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'Todo' },
  { status: 'doing', label: 'Doing' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Done' },
  { status: 'released', label: 'Released' },
  { status: 'reopened', label: 'Reopened' },
];

describe('InternalTaskBadge', () => {
  it.each(cases)(
    'renders the $label label with its AA-safe text and base tint classes for "$status"',
    ({ status, label }) => {
      render(<InternalTaskBadge status={status} />);
      const badge = screen.getByText(label);

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass(`text-status-internal-${status}-label`);
      expect(badge).toHaveClass(`bg-status-internal-${status}/12`);
    },
  );

  for (const { status } of cases) {
    it(`sets data-token to --status-internal-${status}`, () => {
      const { container } = render(<InternalTaskBadge status={status} />);
      const badge = container.querySelector(`[data-token="--status-internal-${status}"]`);
      expect(badge).not.toBeNull();
    });
  }
});
