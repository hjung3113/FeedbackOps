// ReporterStatusChangeBlock.tsx — Public-update composer sub-surface.
// Drives: allowed-only status picker, forbidden explanations, linked-Task gate banner,
// and "Reporter sees" preview card.
//
// C4.1 (slice3 #21)
// Prototype ref: docs/design-prototype/screen-voc.jsx:510-657 (quoted block: :537-655)
// Spec: docs/frontend/specs/voc.md §5.10
//
// Out of scope: mutation, submit, wiring into PublicUpdateComposer (C5.2).
//
// Prototype JSX :537-655 verbatim (reference, implementation mirrors in Pack 17):
//
//   <div style={{marginTop:10,padding:12,background:'rgba(20,40,160,0.04)',borderRadius:6,boxShadow:'inset 0 0 0 1px rgba(20,40,160,0.18)'}}>
//     <div className="hstack" style={{gap:8,marginBottom:10,alignItems:'center'}}>
//       <Icon name="megaphone" size={11} style={{color:'var(--color-neon-lime)'}} />
//       <span className="text-xs" style={{fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',color:'var(--color-neon-lime)'}}>
//         Reporter-facing status 변경
//       </span>
//       <HelpTip ... />
//     </div>
//     <div className="hstack" style={{gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
//       <span className="text-xs muted">현재</span>
//       <ReporterStatusBadge status={voc.reporterStatus} />
//       <span style={{color:'var(--text-muted)'}}>→</span>
//       <span className="text-xs muted">다음</span>
//       <select value={nextStatus} onChange={...} style={{...}}>
//         {pickerOrder.map(key => (
//           <option key={key} value={key} disabled={!isAllowed}>{label}{suffix}</option>
//         ))}
//       </select>
//       {isStaged && !linkedTaskGate && (
//         <span className="badge" style={{background:'rgba(20,40,160,0.16)',color:'var(--color-neon-lime)'}}>
//           <Icon name="check" size={9}/>변경 예정
//         </span>
//       )}
//     </div>
//     {forbidden callout when !allowed && !current ...}
//     {gate callout when linkedTaskGate ...}
//     <div className="vstack" style={{gap:6,marginTop:12}}>
//       <span className="text-xs muted hstack" style={{gap:6}}>
//         <Icon name="user" size={10}/>Reporter가 보게 될 화면 미리보기
//       </span>
//       <div style={{padding:12,...}}>
//         <div className="hstack" style={{gap:8,marginBottom:8,flexWrap:'wrap'}}>
//           <span className="row-id">{voc.id}</span>
//           <ReporterStatusBadge status={nextStatus} />
//           {isStaged && <span>업데이트</span>}
//         </div>
//         <div className="text-sm" style={{fontWeight:500,...}}>{voc.title}</div>
//         <div className="hstack" style={{...}}>
//           <Avatar user={owner} size="sm" />
//           <div>
//             <span><strong>{owner.name}</strong> · 방금</span>
//             {showBody ? <RichContentRenderer ... /> : <span style={{fontStyle:'italic'}}>공개 메시지 본문을 입력하면 여기에서 미리 볼 수 있습니다.</span>}
//           </div>
//         </div>
//         <div style={{...paddingTop:8,borderTop:'1px solid var(--border-subtle)'}}>
//           <Icon name="shield" size={10}/>첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다...
//         </div>
//       </div>
//     </div>
//   </div>

import * as React from 'react';
import { Megaphone, User, Check, ShieldCheck } from 'lucide-react';
import { Callout, ReporterStatusBadge, RichContentRenderer, UserAvatar, type TipTapDoc } from '@fops/ui';
import type { VocDetailEnvelope, ReporterFacingStatusEnum } from '@fops/shared';
import { REPORTER_FACING_STATUS_ALL, REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import { useReporterStatusTransitions } from '@/features/voc/hooks/useReporterStatusTransitions';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OwnerPreview {
  id: string;
  display_name: string;
  email?: string;
}

export interface ReporterStatusChangeBlockProps {
  voc: VocDetailEnvelope;
  /** Currently staged next status (controlled by parent). */
  nextStatus: ReporterFacingStatusEnum;
  /** Called when picker selection changes. */
  onChangeStatus: (status: ReporterFacingStatusEnum) => void;
  /**
   * Current draft TipTap doc (from parent rich editor).
   * Null/empty doc → italic placeholder copy in preview.
   */
  draftDoc: TipTapDoc | null;
  /** Owner actor for the preview attribution line. */
  owner: OwnerPreview;
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

export function ReporterStatusChangeBlock({
  voc,
  nextStatus,
  onChangeStatus,
  draftDoc,
  owner,
}: ReporterStatusChangeBlockProps): React.ReactElement {
  const { allowed, forbidden, gate } = useReporterStatusTransitions(voc);
  const currentStatus = voc.reporter_facing_status;

  // Picker order: current first, then allowed, then all others (forbidden/disabled)
  // Prototype line :531: [voc.reporterStatus, ...allowedNext, ...allKeys.filter(k => k !== current && !allowedNext.includes(k))]
  const pickerOrder: ReporterFacingStatusEnum[] = [
    currentStatus,
    ...allowed.filter((s) => s !== currentStatus),
    ...REPORTER_FACING_STATUS_ALL.filter(
      (s) => s !== currentStatus && !allowed.includes(s),
    ),
  ];

  const isStaged = nextStatus !== currentStatus;
  const isForbiddenSelected =
    nextStatus !== currentStatus && !allowed.includes(nextStatus);

  // Gate blocks the currently-staged next status
  const isGateBlocked =
    gate !== null && gate.blocking_for.includes(nextStatus);

  const showBody = !isDocEmpty(draftDoc);

  return (
    <div
      className="mt-2.5 rounded-md"
      style={{
        padding: '12px',
        background: 'rgb(var(--color-neon-lime) / 0.04)',
        boxShadow: 'inset 0 0 0 1px rgb(var(--color-neon-lime) / 0.18)',
      }}
      data-testid="reporter-status-change-block"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2.5">
        <Megaphone
          size={11}
          aria-hidden="true"
          className="shrink-0 text-accent-primary"
        />
        <span
          className="text-xs font-semibold uppercase tracking-[0.04em] text-accent-primary"
        >
          Reporter-facing status 변경
        </span>
      </div>

      {/* ── Picker row ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <span className="text-xs text-text-muted">현재</span>
        <ReporterStatusBadge status={currentStatus} />
        <span className="text-text-muted text-sm" aria-hidden="true">
          →
        </span>
        <span className="text-xs text-text-muted">다음</span>

        {/* Prototype: native <select> with disabled options for forbidden states */}
        <select
          value={nextStatus}
          onChange={(e) =>
            onChangeStatus(e.target.value as ReporterFacingStatusEnum)
          }
          className="bg-surface-canvas border border-border-strong rounded-md px-2 py-1 text-text-primary text-sm outline-none focus:ring-1 focus:ring-focus-ring"
          aria-label="다음 reporter-facing status 선택"
        >
          {pickerOrder.map((key) => {
            const isCurrent = key === currentStatus;
            const isAllowed = isCurrent || allowed.includes(key);
            const label = REPORTER_STATUS_LABELS[key];
            const suffix = isCurrent
              ? ' (현재)'
              : !isAllowed
              ? ' · 차단됨'
              : '';
            return (
              <option key={key} value={key} disabled={!isAllowed}>
                {label}
                {suffix}
              </option>
            );
          })}
        </select>

        {/* 변경 예정 chip — shown when staged and no gate blocking */}
        {isStaged && !isGateBlocked && !isForbiddenSelected && (
          <span
            className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[11px] font-medium text-accent-primary"
            style={{ background: 'rgb(var(--color-neon-lime) / 0.16)' }}
          >
            <Check size={9} aria-hidden="true" />
            변경 예정
          </span>
        )}
      </div>

      {/* ── Forbidden-state red Callout ─────────────────────────── */}
      {isForbiddenSelected && (
        <Callout
          tone="red"
          title="이 전환은 허용되지 않습니다"
          className="mb-2.5"
        >
          {forbidden[nextStatus] ??
            '현재 상태에서 직접 전이할 수 있는 다음 상태가 아닙니다. spec 의 reporter-facing status 전이 규칙을 따릅니다.'}
        </Callout>
      )}

      {/* ── Linked-Task gate amber Callout ──────────────────────── */}
      {isGateBlocked && gate !== null && (
        <Callout
          tone="amber"
          title="연결된 Task 상태 확인 필요"
          className="mb-2.5"
        >
          {gate.reason}
        </Callout>
      )}

      {/* ── Reporter preview card ───────────────────────────────── */}
      <div className="flex flex-col gap-1.5 mt-3">
        <span className="text-xs text-text-muted flex items-center gap-1.5">
          <User size={10} aria-hidden="true" />
          Reporter가 보게 될 화면 미리보기
        </span>

        <div
          className="rounded-md p-3 bg-surface-canvas"
          style={{ boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}
        >
          {/* VOC id + next status badge + 업데이트 chip */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs font-mono text-text-muted">
              {voc.display_id}
            </span>
            <ReporterStatusBadge status={nextStatus} />
            {isStaged && (
              <span
                className="inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-medium text-accent-primary"
                style={{ background: 'rgb(var(--color-neon-lime) / 0.18)' }}
              >
                업데이트
              </span>
            )}
          </div>

          {/* VOC title */}
          <div className="text-sm font-medium text-text-primary mb-2">
            {voc.title}
          </div>

          {/* Owner attribution + body excerpt */}
          <div className="flex items-start gap-2 mb-1.5">
            <UserAvatar
              user={{ display_name: owner.display_name }}
              size="sm"
            />
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-xs text-text-muted">
                <strong className="text-text-secondary">
                  {owner.display_name}
                </strong>{' '}
                · 방금
              </span>

              {showBody ? (
                <div className="text-sm text-text-primary leading-snug break-words">
                  {/* Sanitized via RichContentRenderer — no dangerouslySetInnerHTML here */}
                  <RichContentRenderer
                    doc={draftDoc as TipTapDoc}
                    mode="reporter_visible"
                  />
                </div>
              ) : (
                <span className="text-sm text-text-muted italic">
                  공개 메시지 본문을 입력하면 여기에서 미리 볼 수 있습니다.
                </span>
              )}
            </div>
          </div>

          {/* Public-safe footer reminder */}
          <div
            className="text-xs text-text-muted flex items-center gap-1.5 mt-2 pt-2"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <ShieldCheck size={10} aria-hidden="true" />
            첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다. 내부 식별자(VOC id, Task id 등)는 자동으로 가려집니다.
          </div>
        </div>
      </div>
    </div>
  );
}
