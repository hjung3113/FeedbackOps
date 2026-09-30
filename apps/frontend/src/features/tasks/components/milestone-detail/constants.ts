import type { MilestoneStatusFilter, TaskDto } from '@fops/shared';
import type { PanelSection } from '@fops/ui';

export const SECTIONS: PanelSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'activity', label: 'Activity' },
];

export const PRIORITY_SEVERITY: Record<
  TaskDto['priority'],
  'low' | 'medium' | 'high' | 'critical'
> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical',
};

export const STATUS_OPTIONS: ReadonlyArray<{ value: MilestoneStatusFilter; label: string }> = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'released', label: 'Released' },
];

export const selectClassName =
  'w-48 rounded border border-border-subtle bg-surface-detail ' +
  'px-2 py-1.5 text-sm text-text-primary';

export const milestonePropertyFieldClassName =
  'grid grid-cols-[120px_1fr] items-start gap-3 px-0 text-[13px] [&>div]:text-left';
