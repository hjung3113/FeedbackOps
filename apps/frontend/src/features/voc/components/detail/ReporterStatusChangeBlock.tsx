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
//       <Select value={nextStatus} onValueChange={...} style={{...}}>
//         {pickerOrder.map(key => (
//           <option key={key} value={key} disabled={!isAllowed}>{label}{suffix}</option>
//         ))}
//       </Select>
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

import {
  isForbiddenTransition,
  useReporterStatusTransitions,
} from '@/features/voc/hooks/useReporterStatusTransitions';
import { REPORTER_FACING_STATUS_ALL, REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import {
  type ReporterFacingStatusEnum,
  type VocDetailEnvelope,
  isTipTapDocStructurallyEmpty,
} from '@fops/shared';
import {
  Callout,
  ReporterStatusBadge,
  RichContentRenderer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type TipTapDoc,
  UserAvatar,
} from '@fops/ui';
import { Check, Megaphone, ShieldCheck, User } from 'lucide-react';
import * as React from 'react';

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
  const isForbiddenSelected = isForbiddenTransition({ allowed }, currentStatus, nextStatus);

  // Gate blocks the currently-staged next status
  const isGateBlocked =
    gate !== null && gate.blocking_for.includes(nextStatus);

  const showBody = !isTipTapDocStructurallyEmpty(draftDoc);

  return (
    <div
      className="mt-2.5 rounded-md p-3 bg-(--status-change-background) shadow-(--status-change-ring)"
      style={
        {
          '--status-change-background': 'rgb(var(--color-neon-lime) / 0.04)',
          '--status-change-ring': 'inset 0 0 0 1px rgb(var(--color-neon-lime) / 0.18)',
        } as React.CSSProperties
      }
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
          className="text-xs font-semibold uppercase tracking-kicker text-accent-primary"
        >
          공개 상태 변경
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

        <Select
          value={nextStatus}
          onValueChange={(value) => onChangeStatus(value as ReporterFacingStatusEnum)}
        >
          <SelectTrigger
            value={nextStatus}
            density="compact"
            className="w-auto min-w-36 max-w-40 rounded-md border-border-strong bg-surface-canvas text-sm text-text-primary outline-hidden focus:ring-1 focus:ring-focus-ring"
            aria-label="다음 공개 상태 선택"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pickerOrder.map((key) => {
              const isCurrent = key === currentStatus;
              const isAllowed = isCurrent || allowed.includes(key);
              const label = REPORTER_STATUS_LABELS[key];
              const suffix = isCurrent ? ' (현재)' : !isAllowed ? ' · 차단됨' : '';
              return (
                <SelectItem key={key} value={key} disabled={!isAllowed}>
                  {label}
                  {suffix}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* 변경 예정 chip — shown when staged and no gate blocking */}
        {isStaged && !isGateBlocked && !isForbiddenSelected && (
          <span
            className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-tiny font-medium text-accent-primary bg-(--status-change-chip-background)"
            style={
              {
                '--status-change-chip-background': 'rgb(var(--color-neon-lime) / 0.16)',
              } as React.CSSProperties
            }
          >
            <Check size={9} aria-hidden="true" />
            변경 예정
          </span>
        )}
      </div>

      {/* ── Forbidden-state red Callout ─────────────────────────── */}
      {/* #356: this Callout is only reachable when the VOC's current status (or its
          allowed set) changed underneath a selection the user had already made —
          see isForbiddenTransition. The old copy read as "you picked the wrong
          option", which is never the actual story, and it was the only signal the
          user got. The composer now also blocks Publish, so the copy has to say
          what changed and what to do. The seeded forbidden reason, when the pair
          is listed at all, is appended as the concrete rule. */}
      {isForbiddenSelected && (
        <Callout
          tone="red"
          title="선택한 상태로는 더 이상 전환할 수 없습니다"
          className="mb-2.5"
        >
          <span data-testid="reporter-status-forbidden-reason">
            이 VOC의 현재 상태가 그 사이 &lsquo;{REPORTER_STATUS_LABELS[currentStatus]}
            &rsquo;(으)로 바뀌어, 먼저 고른 &lsquo;{REPORTER_STATUS_LABELS[nextStatus]}
            &rsquo;(으)로는 전환할 수 없습니다. 다음 상태를 다시 선택해야 게시할 수 있습니다.
            {forbidden[nextStatus] != null && ` ${forbidden[nextStatus]}`}
          </span>
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
          제출자가 보게 될 화면 미리보기
        </span>

        <div
          className="rounded-md p-3 bg-surface-canvas shadow-(--status-change-preview-ring)"
          style={
            {
              '--status-change-preview-ring': 'inset 0 0 0 1px var(--border-subtle)',
            } as React.CSSProperties
          }
        >
          {/* VOC id + next status badge + 업데이트 chip */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs font-mono text-text-muted">
              {voc.display_id}
            </span>
            <ReporterStatusBadge status={nextStatus} />
            {isStaged && (
              <span
                className="inline-flex items-center h-5 px-1.5 rounded-sm text-caption font-medium text-accent-primary bg-(--status-change-update-background)"
                style={
                  {
                    '--status-change-update-background': 'rgb(var(--color-neon-lime) / 0.18)',
                  } as React.CSSProperties
                }
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
                <div className="text-sm text-text-primary leading-snug wrap-break-word">
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
          <div className="text-xs text-text-muted flex items-center gap-1.5 mt-2 pt-2 border-t border-border-subtle">
            <ShieldCheck size={10} aria-hidden="true" />
            첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다. 내부 식별자(VOC id, Task id 등)는 자동으로 가려집니다.
          </div>
        </div>
      </div>
    </div>
  );
}
