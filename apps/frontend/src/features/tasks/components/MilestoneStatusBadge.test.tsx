import { GLOSSARY } from '@/lib/copy/glossary';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

const STATUSES = [
  {
    status: 'planning',
    label: GLOSSARY.milestoneStatusPlanning,
    token: '--status-internal-todo',
    textClass: 'text-status-internal-todo-label',
    dotClass: 'bg-status-internal-todo',
  },
  {
    status: 'in_progress',
    label: GLOSSARY.milestoneStatusInProgress,
    token: '--status-internal-doing',
    textClass: 'text-status-internal-doing-label',
    dotClass: 'bg-status-internal-doing',
  },
  {
    status: 'blocked',
    label: '차단',
    token: '--text-danger',
    textClass: 'text-text-danger-label',
    dotClass: 'bg-accent-danger',
  },
  {
    status: 'released',
    label: GLOSSARY.milestoneStatusReleased,
    token: '--status-internal-done',
    textClass: 'text-status-internal-done-label',
    dotClass: 'bg-status-internal-done',
  },
] as const;

describe('MilestoneStatusBadge', () => {
  it.each(STATUSES)(
    'uses the AA-safe label and keeps the $status tint and dot',
    ({ status, label, token, textClass, dotClass }) => {
      render(<MilestoneStatusBadge status={status} />);

      const badge = screen.getByText(label).closest('[data-token]') as HTMLElement;
      expect(badge).toHaveAttribute('data-token', token);
      expect(badge).toHaveClass(textClass, 'bg-(--status-badge-tint)');
      expect(badge.style.getPropertyValue('--status-badge-tint')).toBe(`rgb(var(${token}) / 0.12)`);

      const dot = badge.querySelector('[aria-hidden="true"]');
      expect(dot).toHaveAttribute('aria-hidden', 'true');
      expect(dot).toHaveClass(dotClass);
    },
  );
});
