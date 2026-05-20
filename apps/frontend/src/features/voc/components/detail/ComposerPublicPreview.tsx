// ComposerPublicPreview — preview card shown inside PreviewModal for public-update surface.
//
// C5.5 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.5
// Prototype ref: docs/design-prototype/screen-voc.jsx:665-707
//
// Verbatim prototype JSX (lines 665-707, Pack 17 translation):
//
//   function ComposerPublicPreview({ voc, owner, nextStatus, draftHtml }) {
//     const trimmed = (draftHtml || '').replace(/<[^>]*>/g, '').trim();
//     return (
//       <div className="vstack" style={{ gap: 12 }}>
//         <span className="text-xs muted">Reporter 가 이 화면을 받습니다. 내부 식별자·@멘션은 자동으로 가려집니다.</span>
//         <div style={{ padding: 14, background: 'var(--color-pitch-black)', borderRadius: 8,
//           boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}>
//           <div className="hstack" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
//             <span className="row-id">{voc.id}</span>
//             <ReporterStatusBadge status={nextStatus} />
//             {nextStatus !== voc.reporterStatus && (
//               <span className="badge" style={{...}}>업데이트</span>
//             )}
//           </div>
//           <div className="text-md" style={{ fontWeight: 600, marginBottom: 12 }}>{voc.title}</div>
//           <div className="hstack" style={{ gap: 10, alignItems: 'flex-start' }}>
//             <Avatar user={owner} size="sm" />
//             <div className="vstack" style={{ gap: 4, flex: 1 }}>
//               <span className="text-xs muted">
//                 <strong style={{ color: 'var(--text-secondary)' }}>{owner.name}</strong> · 방금
//               </span>
//               {trimmed ? (
//                 <div className="text-sm" ... dangerouslySetInnerHTML={{ __html: draftHtml }} />
//               ) : (
//                 <span className="text-sm" style={{ fontStyle: 'italic' }}>(본문이 비어있습니다)</span>
//               )}
//             </div>
//           </div>
//         </div>
//         <div className="text-xs muted hstack" style={{ gap: 6 }}>
//           <Icon name="shield" size={10} />
//           {nextStatus === voc.reporterStatus
//             ? '상태는 그대로 유지됩니다.'
//             : `Reporter-facing 상태가 "..." → "..." 로 변경됩니다.`}
//         </div>
//       </div>
//     );
//   }
//
// Pack 17 notes:
//   - No dangerouslySetInnerHTML: render via <RichContentRenderer mode="reporter_visible">
//   - bg-surface-canvas  → var(--surface-canvas) replaces prototype's var(--color-pitch-black)
//   - border-border-subtle for the inset shadow equivalent
//   - "업데이트" chip: bg-accent-primary/15 text-accent-primary (replaces rgba(20,40,160,0.18))

import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import type { ReporterFacingStatusEnum, VocDetailEnvelope } from '@fops/shared';
import { ReporterStatusBadge, RichContentRenderer } from '@fops/ui';
import type { TipTapDoc } from '@fops/ui';
import { Shield } from 'lucide-react';
import type { ReactElement } from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ComposerPublicPreviewOwner {
  id: string;
  display_name: string;
}

export interface ComposerPublicPreviewProps {
  voc: VocDetailEnvelope;
  owner: ComposerPublicPreviewOwner;
  nextStatus: ReporterFacingStatusEnum;
  /** TipTap doc from the public-update composer draft. Null/empty renders the placeholder. */
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

export function ComposerPublicPreview({
  voc,
  owner,
  nextStatus,
  draftDoc,
}: ComposerPublicPreviewProps): ReactElement {
  const empty = isDocEmpty(draftDoc);
  const isStatusChanging = nextStatus !== voc.reporter_facing_status;

  return (
    <div className="flex flex-col gap-3">
      {/* Disclaimer */}
      <span className="text-xs text-text-muted">
        Reporter 가 이 화면을 받습니다. 내부 식별자·@멘션은 자동으로 가려집니다.
      </span>

      {/* Preview card — prototype: padding 14, bg pitch-black, inset border */}
      <div className="rounded-lg bg-surface-canvas border border-border-subtle p-3.5">
        {/* Header row: display_id + status badge + optional 업데이트 chip */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-mono text-text-muted">{voc.display_id}</span>
          <ReporterStatusBadge status={nextStatus} />
          {isStatusChanging && (
            <span className="inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-medium bg-accent-primary/15 text-accent-primary">
              업데이트
            </span>
          )}
        </div>

        {/* VOC title */}
        <div className="text-sm font-semibold text-text-primary mb-3">{voc.title}</div>

        {/* Owner + body area */}
        <div className="flex items-start gap-2.5">
          {/* Avatar placeholder — prototype uses Avatar component */}
          <div className="w-6 h-6 rounded-full bg-surface-card-elevated flex items-center justify-center shrink-0 text-[10px] text-text-muted font-medium">
            {owner.display_name.slice(0, 1)}
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-xs text-text-muted">
              <strong className="text-text-secondary">{owner.display_name}</strong> · 방금
            </span>
            {empty || draftDoc == null ? (
              <span className="text-sm text-text-muted italic">(본문이 비어있습니다)</span>
            ) : (
              // RichContentRenderer in reporter_visible mode strips mentions per ADR-0011
              <RichContentRenderer doc={draftDoc} mode="reporter_visible" className="text-sm" />
            )}
          </div>
        </div>
      </div>

      {/* Status footer hint */}
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <Shield size={10} aria-hidden="true" />
        {isStatusChanging ? (
          <span>
            Reporter-facing 상태가 &ldquo;{REPORTER_STATUS_LABELS[voc.reporter_facing_status]}
            &rdquo; → &ldquo;{REPORTER_STATUS_LABELS[nextStatus]}&rdquo; 로 변경됩니다.
          </span>
        ) : (
          <span>상태는 그대로 유지됩니다.</span>
        )}
      </div>
    </div>
  );
}
