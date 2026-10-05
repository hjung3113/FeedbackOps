import { GLOSSARY } from '@/lib/copy/glossary';
import type { MilestoneStatusFilter } from '@fops/shared';
import type { PanelSection } from '@fops/ui';

// ADR-0057 A2 amendment localizes Korean navigation; Timeline stays Slice C.
// MilestoneDetailContent appends the child-row count to Tasks when loaded.
export const SECTIONS: PanelSection[] = [
  { id: 'overview', label: '요약' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'activity', label: '이력' },
];

// B2e-status (ADR-0050) — the persisted set is exactly these four values and
// PATCH is free among them. Labels verbatim from MILESTONE_STATUS_META in
// screen-milestones.jsx.
export const STATUS_OPTIONS: ReadonlyArray<{ value: MilestoneStatusFilter; label: string }> = [
  { value: 'planning', label: GLOSSARY.milestoneStatusPlanning },
  { value: 'in_progress', label: GLOSSARY.milestoneStatusInProgress },
  { value: 'blocked', label: '차단' },
  { value: 'released', label: GLOSSARY.milestoneStatusReleased },
];
