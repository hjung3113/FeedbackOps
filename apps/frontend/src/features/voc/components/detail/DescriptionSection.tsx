// DescriptionSection — BODY label + tinted body card per
// `.review/title-reference.png`. Replaces the previous PanelSectionTitle('설명')
// + NestedTextBlock pair.
// C6.2 of slice3 #21 retains the EditDescriptionModal hook on the reporter
// affordance below the card.

import { type VocDetailEnvelope, isTipTapDocStructurallyEmpty } from '@fops/shared';
import { RichContentRenderer, type TipTapDoc } from '@fops/ui';
import * as React from 'react';
import { AttachmentChipList } from './AttachmentChip';
import { EditDescriptionModal } from './EditDescriptionModal';

export interface DescriptionSectionProps {
  voc: VocDetailEnvelope;
  /** Pre-computed by parent: me.actor.id === voc.reporter_id && voc.triage_state === 'untriaged' */
  isReporterOnOwnVoc: boolean;
}

export function DescriptionSection({
  voc,
  isReporterOnOwnVoc,
}: DescriptionSectionProps): React.ReactElement {
  const empty = isTipTapDocStructurallyEmpty(voc.description_rich_content);
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">BODY</p>
      <div
        data-testid="description-body-card"
        className="rounded-md bg-surface-card-elevated p-4 text-sm text-text-secondary leading-relaxed"
      >
        {empty ? (
          <p className="text-text-muted">설명 없음</p>
        ) : (
          <RichContentRenderer doc={voc.description_rich_content as TipTapDoc} mode="internal" />
        )}
      </div>
      {/* PLAN-22 §Bug-1 (2026-05-22): linked attachments on the VOC body.
          BE GET /vocs/:id returns these in voc.attachments[]; clicking a
          chip downloads via GET /attachments/:id/download. */}
      <AttachmentChipList attachments={voc.attachments} />
      {isReporterOnOwnVoc && (
        <>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 text-xs text-text-muted underline hover:text-text-primary transition-colors"
          >
            설명 수정
          </button>
          <EditDescriptionModal voc={voc} open={modalOpen} onClose={() => setModalOpen(false)} />
        </>
      )}
    </div>
  );
}
