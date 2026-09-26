import { getMilestone } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import type { MilestoneDetailDto } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemPill,
  NestedTextBlock,
  OutlineBadge,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  PermissionBlockedPanel,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

// #514 B2d — Milestone detail panel mirroring MilestoneDetailPanel in
// docs/design-prototype/screen-milestones.jsx, mounted in the existing
// ListShell detail slot (never a new shell).
// Timeline and Tasks sections are deliberately omitted: Timeline is Slice C
// (TaskGantt) and Tasks is B2d-tasks behind the G-columns record (design §7 item 12).
// B2d fixup — the shared header and close action stay mounted on every detail
// read state (review finding 2), the why keeps the prototype's NestedTextBlock
// nesting (finding 1), and a linked source Finding offers Open finding
// navigation to its own route (finding 3).

const SECTIONS: PanelSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'activity', label: 'Activity' },
];

export interface MilestoneDetailPanelProps {
  milestoneId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
}

export function MilestoneDetailPanel({
  milestoneId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
}: MilestoneDetailPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const milestoneQuery = useQuery({
    queryKey: ['milestone', milestoneId] as const,
    queryFn: ({ signal }) => getMilestone(milestoneId, signal),
    staleTime: 30 * 1000,
  });
  const error = milestoneQuery.error;
  const milestone = milestoneQuery.data;

  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      {/* Panel chrome first: header and close stay mounted independently of the
          query result, so pending, denied, and unavailable reads all stay
          dismissible. Identity (display id) and the copy-link action only
          exist once the record resolves — no unavailable record data renders. */}
      <DetailPanelHeader
        kind="milestone"
        onClose={onClose}
        {...(milestone !== undefined
          ? {
              id: milestone.display_id,
              extras: (
                <DetailPanelHeaderActions
                  entityKind="milestone"
                  entityId={milestone.id}
                  copyUrl={`/tasks?view=milestones&param=${milestone.id}`}
                />
              ),
            }
          : {})}
      />
      {milestone === undefined ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {milestoneQuery.isLoading ? (
            <div className="p-4 text-sm text-text-muted">Loading Milestone…</div>
          ) : error !== null && isPermissionDenied(error) ? (
            <PermissionBlockedPanel
              state="denied"
              category="Milestone detail"
              reason={error.message}
              className="m-4"
            />
          ) : (
            <div className="p-4 text-sm text-accent-danger">Milestone detail unavailable.</div>
          )}
        </div>
      ) : (
        <MilestoneDetailContent
          milestone={milestone}
          scrollRef={scrollRef}
          actorNamesById={actorNamesById}
          managedSystemNamesById={managedSystemNamesById}
          analyticsAreaNamesById={analyticsAreaNamesById}
        />
      )}
    </aside>
  );
}

interface MilestoneDetailContentProps {
  milestone: MilestoneDetailDto;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
}

function MilestoneDetailContent({
  milestone,
  scrollRef,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
}: MilestoneDetailContentProps) {
  const navigate = useNavigate();
  const sourceFinding = milestone.source_finding;
  const areaName =
    milestone.analytics_area_id !== null
      ? analyticsAreaNamesById.get(milestone.analytics_area_id)
      : undefined;
  const ownerName = actorNamesById.get(milestone.owner_actor_id);
  const managedSystemName =
    managedSystemNamesById.get(milestone.primary_managed_system_id) ?? 'Managed System';

  return (
    <>
      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelTitleBlock
            title={milestone.title}
            badges={
              <>
                <MilestoneStatusBadge status={milestone.status} />
                <ManagedSystemPill name={managedSystemName} />
                {areaName !== undefined && <OutlineBadge>{areaName}</OutlineBadge>}
              </>
            }
          />

          {/* Progress strip — real child-Task buckets from progress (B1c);
              no planned bucket, planned tasks are prototype-only. */}
          <div className="mx-4 mb-3 flex flex-col gap-2.5 rounded-sm border border-border-subtle bg-surface-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                {milestone.progress.released_done} of {milestone.progress.total} tasks released
              </span>
              <span className="text-sm font-semibold tabular-nums text-text-secondary">
                {milestone.progress.percent}%
              </span>
            </div>
            {/* Decorative bar — the strip's text already carries the numbers. */}
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-canvas"
              aria-hidden="true"
            >
              <div
                className="h-full bg-accent-primary"
                style={{ width: `${milestone.progress.percent}%` }}
              />
            </div>
            <div className="flex items-center gap-2.5 text-xs text-text-muted">
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.released_done}
                </span>{' '}
                released/done
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.in_flight}
                </span>{' '}
                in flight
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.queued}
                </span>{' '}
                queued
              </span>
            </div>
          </div>

          {/* Why this milestone exists — required by FR-TASK-004. The prototype
              nests the plain-text why in NestedTextBlock (screen-milestones.jsx);
              plain text, no rich content in the DTO. */}
          <div className="border-t border-border-subtle px-4 py-4">
            <PanelSectionTitle>Why this milestone exists</PanelSectionTitle>
            <NestedTextBlock>{milestone.why}</NestedTextBlock>
          </div>

          <div className="border-t border-border-subtle px-4 py-4">
            {/* Title row carries the prototype's Open finding action when a
                source Finding is linked (finding 3): navigation to the existing
                Finding detail route only — no Finding → Milestone writer. */}
            <div className="flex items-center justify-between">
              <PanelSectionTitle className="mb-0">Source</PanelSectionTitle>
              {sourceFinding !== null && (
                <Button
                  variant="subtle"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    void navigate({
                      to: '/findings/$findingId',
                      params: { findingId: sourceFinding.id },
                    });
                  }}
                >
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  Open finding
                </Button>
              )}
            </div>
            {sourceFinding ? (
              <div className="mt-2 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3">
                <span className="text-xs text-text-muted">From finding</span>
                <div className="text-sm font-medium text-text-primary">
                  <span className="mr-2 font-mono text-xs text-text-muted">
                    {sourceFinding.display_id}
                  </span>
                  {sourceFinding.title}
                </div>
                <p className="text-sm text-text-muted">{sourceFinding.summary}</p>
                <div className="flex flex-wrap gap-2">
                  <OutlineBadge>Evidence · {sourceFinding.evidence_count}</OutlineBadge>
                </div>
              </div>
            ) : (
              // No Finding → Milestone writer exists (#514 out-of-scope list):
              // ship the prototype's standalone copy without a Link control.
              <div className="mt-2 text-sm text-text-muted">
                근거 Finding 이 연결되어 있지 않습니다. Standalone milestone 으로 운영 중입니다.
              </div>
            )}
          </div>

          <div className="border-t border-border-subtle py-2">
            <PanelSectionTitle className="px-4">Properties</PanelSectionTitle>
            <FieldRow label="Status">
              <MilestoneStatusBadge status={milestone.status} />
            </FieldRow>
            {/* Managed System is create-only (A3/A8): read-only text, never an input. */}
            <FieldRow label="Managed System">
              <ManagedSystemPill name={managedSystemName} />
            </FieldRow>
            <FieldRow label="Analytics Area">
              {areaName !== undefined ? (
                <OutlineBadge>{areaName}</OutlineBadge>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Owner">
              {ownerName ?? <span className="text-text-muted">—</span>}
            </FieldRow>
            <FieldRow label="Start">
              <span className="font-mono text-xs text-text-secondary">{milestone.start_date}</span>
            </FieldRow>
            <FieldRow label="Target">
              <span className="font-mono text-xs text-text-secondary">{milestone.target_date}</span>
            </FieldRow>
            <FieldRow label="Created">{milestone.created_at.slice(0, 10)}</FieldRow>
          </div>
        </div>

        <div data-anchor="evidence" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Evidence</PanelSectionTitle>
          {/* No evidence read path in these slices (manual linking is §7 item 14);
              empty copy only — no Outcome survey controls (FOP-OUT-014). */}
          <div className="py-3 text-center text-xs text-text-muted">
            연결된 evidence highlight 가 없습니다.
          </div>
        </div>

        <div data-anchor="activity" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Activity</PanelSectionTitle>
          {/* No audit_log read path exists (§7 item 9); the empty copy ships. */}
          <div className="py-3 text-center text-xs text-text-muted">활동 기록이 없습니다.</div>
        </div>
      </div>
    </>
  );
}

function isPermissionDenied(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}
