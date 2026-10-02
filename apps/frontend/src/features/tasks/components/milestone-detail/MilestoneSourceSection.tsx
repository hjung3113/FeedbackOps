import type { MilestoneDetailDto } from '@fops/shared';
import { Button, DirtyConfirmation } from '@fops/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';
import { MilestoneOutlineBadge, MilestonePanelSectionTitle } from '../MilestoneIdentity';

export function MilestoneSourceSection({
  sourceFinding,
  titleDirty,
  discardTitleEdit,
}: {
  sourceFinding: MilestoneDetailDto['source_finding'];
  titleDirty: boolean;
  discardTitleEdit: () => void;
}) {
  const navigate = useNavigate();
  const [pendingFindingId, setPendingFindingId] = React.useState<string | null>(null);

  return (
    <>
      <div className="mb-8">
        {/* Title row carries the prototype's Open finding action when a
            source Finding is linked (finding 3): navigation to the existing
            Finding detail route only — no Finding → Milestone writer. */}
        <div className="flex items-center justify-between">
          <MilestonePanelSectionTitle className="mb-0">출처</MilestonePanelSectionTitle>
          {sourceFinding !== null && (
            <Button
              variant="subtle"
              size="sm"
              className="h-6 gap-1.5 px-2 text-[12px]"
              onClick={() => {
                // R4 — an unsaved title draft confirms before the panel
                // is left; a clean panel navigates immediately.
                if (titleDirty) {
                  setPendingFindingId(sourceFinding.id);
                  return;
                }
                void navigate({
                  to: '/findings/$findingId',
                  params: { findingId: sourceFinding.id },
                });
              }}
            >
              <ArrowRight className="h-[11px] w-[11px]" aria-hidden="true" />
              Finding 열기
            </Button>
          )}
        </div>
        {sourceFinding ? (
          <div className="mt-2.5 flex flex-col gap-1.5 rounded-md bg-surface-canvas p-3">
            <span className="text-xs text-text-muted">Finding에서</span>
            <div className="text-[13px] font-medium text-text-primary">
              <span className="mr-1.5 font-mono text-xs text-text-muted">
                {sourceFinding.display_id}
              </span>
              {sourceFinding.title}
            </div>
            {/* Prototype renders the finding summary at 12px (text-xs) with
                1.55 line height (screen-milestones.jsx Source block). */}
            <p className="text-xs leading-[1.55] text-text-muted">{sourceFinding.summary}</p>
            <div className="flex flex-wrap gap-2">
              <MilestoneOutlineBadge>
                Evidence · {sourceFinding.evidence_count}
              </MilestoneOutlineBadge>
            </div>
          </div>
        ) : (
          // No Finding → Milestone writer exists (#514 out-of-scope list):
          // ship the prototype's standalone copy without a Link control.
          <div className="mt-2 text-sm text-text-muted">
            {'근거 Finding이 연결되어 있지 않습니다. ' + '단독 Milestone으로 운영 중입니다.'}
          </div>
        )}
      </div>
      <DirtyConfirmation
        open={pendingFindingId !== null}
        onConfirm={() => {
          const findingId = pendingFindingId;
          setPendingFindingId(null);
          discardTitleEdit();
          if (findingId !== null) {
            void navigate({ to: '/findings/$findingId', params: { findingId } });
          }
        }}
        onCancel={() => setPendingFindingId(null)}
      />
    </>
  );
}
