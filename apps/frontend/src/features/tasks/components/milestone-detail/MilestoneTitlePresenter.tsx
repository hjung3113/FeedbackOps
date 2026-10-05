import { GLOSSARY } from '@/lib/copy/glossary';
import type { MilestoneDetailDto } from '@fops/shared';
import { Button, Input, PanelTitleBlock } from '@fops/ui';
import { Pencil } from 'lucide-react';

import { MilestoneManagedSystemPill, MilestoneOutlineBadge } from '../MilestoneIdentity';
import { MilestoneStatusBadge } from '../MilestoneStatusBadge';
import type { UseMilestoneStatusEditResult } from './useMilestoneStatusEdit';
import type { UseMilestoneTitleEditResult } from './useMilestoneTitleEdit';

export function MilestoneTitlePresenter({
  milestone,
  managedSystemName,
  areaName,
  titleEdit,
  statusEdit,
}: {
  milestone: MilestoneDetailDto;
  managedSystemName: string;
  areaName: string | undefined;
  titleEdit: UseMilestoneTitleEditResult;
  statusEdit: UseMilestoneStatusEditResult;
}) {
  const {
    editingTitle,
    titleDraft,
    setTitleDraft,
    titleError,
    setTitleError,
    titleMutation,
    startTitleEdit,
    cancelTitleEdit,
    submitTitleEdit,
  } = titleEdit;
  const { statusMutation } = statusEdit;

  return (
    <>
      <PanelTitleBlock
        className="mb-6 p-0"
        title={milestone.title}
        badges={
          <>
            <MilestoneStatusBadge status={milestone.status} />
            <MilestoneManagedSystemPill name={managedSystemName} />
            {areaName !== undefined && <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>}
          </>
        }
      />

      {/* B2e — title-only edit control. Only the title becomes an input; stale If-Match shows server text. */}
      {editingTitle ? (
        <form
          className="mb-4 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3"
          onSubmit={(event) => submitTitleEdit(event, statusMutation.isPending)}
        >
          <div className="flex flex-col gap-1 text-xs text-text-muted">
            <span>제목</span>
            <Input
              aria-label="제목"
              disabled={titleMutation.isPending}
              value={titleDraft}
              onChange={(event) => {
                setTitleDraft(event.target.value);
                setTitleError(null);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={titleMutation.isPending || statusMutation.isPending}
            >
              {GLOSSARY.save}
            </Button>
            <Button type="button" variant="subtle" size="sm" onClick={cancelTitleEdit}>
              {GLOSSARY.cancel}
            </Button>
            {titleError !== null && (
              <span className="text-sm text-accent-danger">{titleError}</span>
            )}
          </div>
        </form>
      ) : (
        <div className="mb-4 flex justify-end">
          {/* Keep the editor closed while either write waits for its invalidation to settle. */}
          <Button
            variant="subtle"
            size="sm"
            spacing="compact"
            disabled={titleMutation.isPending || statusMutation.isPending}
            onClick={() => startTitleEdit(statusMutation.isPending)}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            {GLOSSARY.editTitle}
          </Button>
        </div>
      )}
    </>
  );
}
