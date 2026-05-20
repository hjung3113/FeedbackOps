// ComposerReplyPreview — preview card shown inside PreviewModal for reporter-reply surface.
//
// C5.5 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.5
// Prototype ref: docs/design-prototype/screen-voc.jsx:709-742
//
// Verbatim prototype JSX (lines 709-742, Pack 17 translation):
//
//   function ComposerReplyPreview({ voc, owner, reporter, draftHtml }) {
//     const trimmed = (draftHtml || '').replace(/<[^>]*>/g, '').trim();
//     return (
//       <div className="vstack" style={{ gap: 12 }}>
//         <span className="text-xs muted">Reporter 1:1 답장 화면 미리보기입니다. 공개 타임라인에도 기록됩니다.</span>
//         <div style={{ padding: 14, background: 'var(--color-pitch-black)', borderRadius: 8,
//           boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
//           display: 'flex', flexDirection: 'column', gap: 10 }}>
//           {/* Reporter's original message bubble for context */}
//           <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
//             <Avatar user={reporter} size="sm" />
//             <div style={{ flex: 1, background: 'var(--surface-card)', padding: 10,
//               borderRadius: 6, fontSize: 'var(--text-sm)' }}>
//               <div className="text-xs muted" style={{ marginBottom: 4 }}>{reporter.name} · {voc.createdAt}</div>
//               {voc.description.slice(0, 140)}{voc.description.length > 140 ? '…' : ''}
//             </div>
//           </div>
//           {/* The owner's reply */}
//           <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
//             <Avatar user={owner} size="sm" />
//             <div style={{ flex: 1, background: 'rgba(94,106,210,0.12)', padding: 10,
//               borderRadius: 6, fontSize: 'var(--text-sm)' }}>
//               <div className="text-xs muted" style={{ marginBottom: 4 }}>{owner.name} · 방금</div>
//               {trimmed ? (
//                 <div dangerouslySetInnerHTML={{ __html: draftHtml }} />
//               ) : (
//                 <span style={{ fontStyle: 'italic' }}>(메시지 본문이 비어있습니다)</span>
//               )}
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }
//
// Pack 17 notes:
//   - No dangerouslySetInnerHTML: render via <RichContentRenderer mode="reporter_visible">
//   - bg-surface-canvas replaces prototype's var(--color-pitch-black)
//   - bg-surface-card for reporter bubble
//   - bg-accent-primary/10 replaces rgba(94,106,210,0.12) (deep-violet @ 12% was the dark-pack
//     aether-blue; in Pack 17 use bg-accent-primary/10 per PROTOTYPE-TO-PACK17 §1 notes)

import type { VocDetailEnvelope } from '@fops/shared';
import { RichContentRenderer } from '@fops/ui';
import type { TipTapDoc } from '@fops/ui';
import type { ReactElement } from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ComposerReplyPreviewActor {
  id: string;
  display_name: string;
}

export interface ComposerReplyPreviewProps {
  voc: VocDetailEnvelope;
  owner: ComposerReplyPreviewActor;
  reporter: ComposerReplyPreviewActor;
  /** TipTap doc from the reporter-reply composer draft. Null/empty renders the placeholder. */
  draftDoc: TipTapDoc | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDocEmpty(doc: TipTapDoc | null): boolean {
  if (doc == null) return true;
  const content = doc.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((node) => {
    if (node == null || typeof node !== 'object') return true;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type !== 'paragraph') return false;
    return !Array.isArray(n.content) || n.content.length === 0;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComposerReplyPreview({
  voc,
  owner,
  reporter,
  draftDoc,
}: ComposerReplyPreviewProps): ReactElement {
  const empty = isDocEmpty(draftDoc);

  // Derive a short text excerpt from the description for the reporter bubble.
  // Prototype: voc.description.slice(0, 140) + '…' — we use voc.title as fallback
  // since description_rich_content is a TipTapDoc not a plain string.
  const descExcerpt = voc.title ?? '';

  return (
    <div className="flex flex-col gap-3">
      {/* Disclaimer */}
      <span className="text-xs text-text-muted">
        Reporter 1:1 답장 화면 미리보기입니다. 공개 타임라인에도 기록됩니다.
      </span>

      {/* Preview card — prototype: padding 14, bg pitch-black, inset border */}
      <div className="flex flex-col gap-2.5 rounded-lg bg-surface-canvas border border-border-subtle p-3.5">
        {/* Reporter's original message bubble */}
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-card-elevated flex items-center justify-center shrink-0 text-[10px] text-text-muted font-medium">
            {reporter.display_name.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0 bg-surface-card rounded-md p-2.5 text-sm">
            <div className="text-xs text-text-muted mb-1">
              {reporter.display_name} · {voc.created_at.slice(0, 10)}
            </div>
            <span className="text-text-secondary">
              {descExcerpt.length > 140 ? `${descExcerpt.slice(0, 140)}…` : descExcerpt}
            </span>
          </div>
        </div>

        {/* Owner's reply bubble — bg-accent-primary/10 per §1 notes */}
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-card-elevated flex items-center justify-center shrink-0 text-[10px] text-text-muted font-medium">
            {owner.display_name.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0 bg-accent-primary/10 rounded-md p-2.5 text-sm">
            <div className="text-xs text-text-muted mb-1">{owner.display_name} · 방금</div>
            {empty || draftDoc == null ? (
              <span className="text-text-muted italic">(메시지 본문이 비어있습니다)</span>
            ) : (
              <RichContentRenderer doc={draftDoc} mode="reporter_visible" className="text-sm" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
