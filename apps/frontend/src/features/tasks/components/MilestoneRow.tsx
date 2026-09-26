import type { MilestoneDto } from '@fops/shared';
import type { AvatarUser } from '@fops/ui';
import { ManagedSystemPill, ObjectRow, OutlineBadge, UserAvatar } from '@fops/ui';
import { Flag, ListChecks } from 'lucide-react';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

export interface MilestoneRowProps {
  milestone: MilestoneDto;
  /** Resolved Managed System name; raw UUIDs are never rendered (lookup done by the route). */
  managedSystemName: string;
  /** Resolved Analytics Area name; the badge is omitted when the area is absent or unresolved. */
  areaName?: string;
  owner?: AvatarUser;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

// Row anatomy per the approved B2c plan (screen-milestones.jsx MilestoneRow):
// flag · display id · title · status · Managed System · optional Analytics Area ·
// one-line why · task count · released ratio · target date · owner avatar.
// The source-Finding chip and per-row evidence count are intentionally omitted
// (the list DTO carries neither); the mini timeline is Slice C.
export function MilestoneRow({
  milestone,
  managedSystemName,
  areaName,
  owner,
  selected = false,
  onSelect,
}: MilestoneRowProps) {
  return (
    <ObjectRow
      icon={<Flag className="h-4 w-4" aria-hidden="true" />}
      id={milestone.display_id}
      title={milestone.title}
      selected={selected}
      density="expanded"
      {...(onSelect !== undefined ? { onClick: () => onSelect(milestone.id) } : {})}
      badges={
        <>
          <MilestoneStatusBadge status={milestone.status} />
          <ManagedSystemPill name={managedSystemName} />
          {areaName !== undefined && <OutlineBadge>{areaName}</OutlineBadge>}
        </>
      }
      meta={
        <>
          <span className="max-w-[540px] truncate text-text-secondary" title={milestone.why}>
            {milestone.why}
          </span>
          {dot()}
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">{milestone.progress.total}</span>
          </span>
          {dot()}
          <span className="tabular-nums">
            {milestone.progress.released_done}/{milestone.progress.total} released
          </span>
          {dot()}
          <span className="inline-flex items-center gap-1">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">{milestone.target_date}</span>
          </span>
        </>
      }
      {...(owner !== undefined ? { trailing: <UserAvatar user={owner} size="sm" /> } : {})}
    />
  );
}
