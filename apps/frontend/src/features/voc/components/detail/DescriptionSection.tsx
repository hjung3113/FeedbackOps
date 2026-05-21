// DescriptionSection — BODY label + tinted body card per
// `.review/title-reference.png`. Replaces the previous PanelSectionTitle('설명')
// + NestedTextBlock pair.
// C6.2 of slice3 #21 retains the EditDescriptionModal hook on the reporter
// affordance below the card.

import type { VocDetailEnvelope } from '@fops/shared';
import { RichContentRenderer, type TipTapDoc } from '@fops/ui';
import * as React from 'react';
import { EditDescriptionModal } from './EditDescriptionModal';

export interface DescriptionSectionProps {
  voc: VocDetailEnvelope;
  /** Pre-computed by parent: me.actor.id === voc.reporter_id && voc.triage_state === 'untriaged' */
  isReporterOnOwnVoc: boolean;
}

// A TipTap doc with no meaningful content. The schema requires { type: 'doc',
// content?: unknown[] }, so we treat any of these as "empty" for UX fallback:
//   - missing content array
//   - empty content array
//   - content with only empty paragraph nodes (no text children)
function isDocEmpty(doc: unknown): boolean {
  if (doc == null || typeof doc !== 'object') return true;
  const content = (doc as { content?: unknown[] }).content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((node) => {
    if (node == null || typeof node !== 'object') return true;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type !== 'paragraph') return false;
    return !Array.isArray(n.content) || n.content.length === 0;
  });
}

export function DescriptionSection({
  voc,
  isReporterOnOwnVoc,
}: DescriptionSectionProps): React.ReactElement {
  const empty = isDocEmpty(voc.description_rich_content);
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div className="px-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
        BODY
      </p>
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
