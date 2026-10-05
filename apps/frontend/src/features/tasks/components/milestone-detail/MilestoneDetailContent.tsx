import { GLOSSARY } from '@/lib/copy/glossary';
import type { MilestoneDetailDto } from '@fops/shared';
import { DetailPanelSectionNav, EmptyState, NestedTextBlock, ProgressMeter } from '@fops/ui';
import type * as React from 'react';

import { MilestonePanelSectionTitle } from '../MilestoneIdentity';
import { MilestonePropertiesPresenter } from './MilestonePropertiesPresenter';
import { MilestoneSourceSection } from './MilestoneSourceSection';
import { MilestoneTasksSection } from './MilestoneTasksSection';
import { MilestoneTitlePresenter } from './MilestoneTitlePresenter';
import { SECTIONS } from './constants';
import { useMilestoneChildTasks } from './useMilestoneChildTasks';
import { useMilestoneStatusEdit } from './useMilestoneStatusEdit';
import { useMilestoneTitleEdit } from './useMilestoneTitleEdit';

interface MilestoneDetailContentProps {
  milestone: MilestoneDetailDto;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
  /** B2e fixup — reports whether a header close would discard a title draft. */
  onTitleDirtyChange: (dirty: boolean) => void;
}

export function MilestoneDetailContent({
  milestone,
  scrollRef,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
  onTitleDirtyChange,
}: MilestoneDetailContentProps) {
  const sourceFinding = milestone.source_finding;
  // This one safe projection feeds both the navigation count and the section rows/error barrier.
  const { childTasks, error: childTasksError } = useMilestoneChildTasks(milestone.id);

  const titleEdit = useMilestoneTitleEdit(milestone, onTitleDirtyChange);
  const statusEdit = useMilestoneStatusEdit({
    milestone,
    titleEditVersion: titleEdit.titleEditVersion,
    setTitleEditVersion: titleEdit.setTitleEditVersion,
    discardTitleEdit: titleEdit.discardTitleEdit,
  });

  const areaName =
    milestone.analytics_area_id !== null
      ? analyticsAreaNamesById.get(milestone.analytics_area_id)
      : undefined;
  const ownerName = actorNamesById.get(milestone.owner_actor_id);
  const managedSystemName =
    managedSystemNamesById.get(milestone.primary_managed_system_id) ?? 'Managed System';

  return (
    <>
      <DetailPanelSectionNav
        sections={SECTIONS.map((section) =>
          section.id === 'tasks' && childTasks !== undefined
            ? { ...section, count: childTasks.length }
            : section,
        )}
        scrollRef={scrollRef}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-7 pb-8"
        data-testid="milestone-detail-scroll"
      >
        {/* CP-pixel finding 3 (.review/pixel-514-findings.md): the panel body
            carries the prototype's density (styles.css): .panel-scroll padding
            28/24/32 here, .panel-section 32px bottom rhythm (mb-8) on the
            sections below, .panel-title-block margin-bottom 24 only (the
            shared px-4 py-3 is neutralized — no extra inset), and 12px-pad
            nested cards instead of the earlier 16px-padding bordered cards.
            Feature-local classes only; shared panel components are consumed,
            not redesigned. The 24px scroll padding owns all horizontal insets. */}
        <div data-anchor="overview">
          <MilestoneTitlePresenter
            milestone={milestone}
            managedSystemName={managedSystemName}
            areaName={areaName}
            titleEdit={titleEdit}
            statusEdit={statusEdit}
          />

          {/* Progress strip — real child-Task buckets from progress (B1c); planned tasks are prototype-only. */}
          <div className="mb-8 flex flex-col gap-2.5 rounded-md bg-surface-canvas p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                Task {milestone.progress.total}개 중 {milestone.progress.released_done}개 Released
              </span>
              <span className="text-sm font-semibold tabular-nums text-text-secondary">
                {milestone.progress.percent}%
              </span>
            </div>
            {/* Decorative bar — the strip's text already carries the numbers. */}
            <ProgressMeter
              value={milestone.progress.percent}
              size="thin"
              tone="primary"
              trackTone="subtle"
              fillShape="square"
              semantics="decorative"
            />
            <div className="flex items-center gap-2.5 text-xs text-text-muted">
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.released_done}
                </span>{' '}
                Released/Done
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.in_flight}
                </span>{' '}
                진행 중
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.queued}
                </span>{' '}
                대기 중
              </span>
            </div>
          </div>

          {/* Why this milestone exists — keep the plain-text contract in NestedTextBlock. */}
          <div className="mb-8">
            <MilestonePanelSectionTitle>
              {GLOSSARY.whyThisMilestoneExists}
            </MilestonePanelSectionTitle>
            <NestedTextBlock className="p-3 text-sm leading-[1.6] text-text-secondary">
              {milestone.why}
            </NestedTextBlock>
          </div>

          <MilestoneSourceSection
            sourceFinding={sourceFinding}
            titleDirty={titleEdit.titleDirty}
            discardTitleEdit={titleEdit.discardTitleEdit}
          />

          <MilestonePropertiesPresenter
            milestone={milestone}
            managedSystemName={managedSystemName}
            areaName={areaName}
            ownerName={ownerName}
            titleEdit={titleEdit}
            statusEdit={statusEdit}
          />
        </div>

        <MilestoneTasksSection
          childTasks={childTasks}
          error={childTasksError}
          actorNamesById={actorNamesById}
        />

        <div data-anchor="evidence" className="mb-8 last:mb-0">
          <MilestonePanelSectionTitle>Evidence</MilestonePanelSectionTitle>
          {/* No evidence read path in these slices (manual linking is §7 item 14); empty copy only. */}
          <EmptyState
            size="sm"
            density="compact"
            title={`연결된 ${GLOSSARY.evidenceHighlight}가 없습니다.`}
          />
        </div>

        <div data-anchor="activity" className="last:mb-0">
          <MilestonePanelSectionTitle>이력</MilestonePanelSectionTitle>
          {/* No audit_log read path exists (§7 item 9); the empty copy ships. */}
          <EmptyState size="sm" density="compact" title="활동 기록이 없습니다." />
        </div>
      </div>
    </>
  );
}
