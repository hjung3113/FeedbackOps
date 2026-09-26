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

// Row anatomy per the approved B2c plan and the prototype's three-line
// hierarchy (screen-milestones.jsx MilestoneRow): line 1 = flag · display id ·
// title · status · Managed System · optional Analytics Area; line 2 = one-line
// why; line 3 = task count · released ratio · target date. The source-Finding
// chip and per-row evidence count are intentionally omitted (the list DTO
// carries neither); the mini timeline is Slice C.
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
      selected={selected}
      density="expanded"
      {...(onSelect !== undefined ? { onClick: () => onSelect(milestone.id) } : {})}
      title={
        <>
          {milestone.title}
          <MilestoneStatusBadge status={milestone.status} />
          <ManagedSystemPill name={managedSystemName} />
          {areaName !== undefined && <OutlineBadge>{areaName}</OutlineBadge>}
        </>
      }
      {...(owner !== undefined ? { trailing: <UserAvatar user={owner} size="sm" /> } : {})}
    >
      <div className="max-w-[540px] truncate text-xs text-text-secondary" title={milestone.why}>
        {milestone.why}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{milestone.progress.total}</span>
        </span>
        <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />
        <span className="tabular-nums">
          {milestone.progress.released_done}/{milestone.progress.total} released
        </span>
        <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />
        <span className="inline-flex items-center gap-1">
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{milestone.target_date}</span>
        </span>
      </div>
    </ObjectRow>
  );
}
