/**
 * OwnerPicker — selects the owner (user or team) for a VOC during triage.
 *
 * Prototype ref: screen-voc-create.jsx:466-491
 * Token translations (PROTOTYPE-TO-PACK17.md §3.15):
 *   .entity-node rows → bg-surface-canvas shadow-subtle rounded-md
 *   active entity-node → bg-accent-primary/6 ring-1 ring-inset ring-accent-primary/40
 *   .entity-node-title → text-xs font-medium text-text-primary
 *   .entity-node-meta → text-[10px] text-text-muted
 *
 * Decision D-2.1 (PLAN-21): threshold is exactly 5.
 *   candidates.length <= 5 → RadioGroup-style entity rows
 *   candidates.length > 5  → Combobox (search + select)
 *
 * Decision D-2.3: "(미지정)" maps to { ownerUserId: null, ownerTeamId: null }.
 */

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn, Combobox, UserAvatar } from '@fops/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OwnerCandidate {
  id: string;
  display_name: string;
  kind: 'user' | 'team';
  /** Optional meta description line, e.g. "담당 시스템: Tableau Revenue · 대기 4건" */
  meta?: string;
}

export interface OwnerValue {
  ownerUserId: string | null;
  ownerTeamId: string | null;
}

export interface OwnerPickerProps {
  candidates: OwnerCandidate[];
  value: string | null;  // selected actor id (user or team), or null for 미지정
  onChange: (value: OwnerValue) => void;
  disabled?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNASSIGNED_ID = '__unassigned__';
const COMBOBOX_THRESHOLD = 5;

// ── Component ─────────────────────────────────────────────────────────────────

export function OwnerPicker({
  candidates,
  value,
  onChange,
  disabled = false,
}: OwnerPickerProps): React.ReactElement {

  function toOwnerValue(candidateId: string | null): OwnerValue {
    if (candidateId === null || candidateId === UNASSIGNED_ID) {
      return { ownerUserId: null, ownerTeamId: null };
    }
    const actor = candidates.find((c) => c.id === candidateId);
    if (!actor) return { ownerUserId: null, ownerTeamId: null };
    return actor.kind === 'team'
      ? { ownerUserId: null, ownerTeamId: actor.id }
      : { ownerUserId: actor.id, ownerTeamId: null };
  }

  // Combobox mode (>5 candidates)
  if (candidates.length > COMBOBOX_THRESHOLD) {
    const options = [
      { value: UNASSIGNED_ID, label: '(미지정)' },
      ...candidates.map((c) => ({ value: c.id, label: c.display_name })),
    ];

    return (
      <Combobox
        options={options}
        value={value ?? UNASSIGNED_ID}
        onChange={(v) => {
          onChange(toOwnerValue(v === UNASSIGNED_ID ? null : v));
        }}
        placeholder="Owner 선택…"
        searchPlaceholder="이름으로 검색…"
        disabled={disabled}
      />
    );
  }

  // RadioGroup-style entity rows (≤5 candidates)
  return (
    <div className="flex flex-col gap-1.5">
      {/* "(미지정)" always first — D-2.3 */}
      <OwnerRow
        id={UNASSIGNED_ID}
        displayName="(미지정)"
        isActive={value === null}
        onClick={() => { onChange({ ownerUserId: null, ownerTeamId: null }); }}
        disabled={disabled}
      />

      {candidates.map((actor) => (
        <OwnerRow
          key={actor.id}
          id={actor.id}
          displayName={actor.display_name}
          meta={actor.meta}
          isActive={value === actor.id}
          user={actor.kind === 'user' ? { display_name: actor.display_name } : undefined}
          onClick={() => { onChange(toOwnerValue(actor.id)); }}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

OwnerPicker.displayName = 'OwnerPicker';

// ── OwnerRow sub-component ────────────────────────────────────────────────────

interface OwnerRowProps {
  id: string;
  displayName: string;
  meta?: string | undefined;
  isActive: boolean;
  user?: { display_name: string } | undefined;
  onClick: () => void;
  disabled?: boolean | undefined;
}

function OwnerRow({
  id,
  displayName,
  meta,
  isActive,
  user,
  onClick,
  disabled,
}: OwnerRowProps): React.ReactElement {
  return (
    <button
      type="button"
      data-owner-id={id}
      data-active={isActive ? 'true' : 'false'}
      aria-pressed={isActive}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // .entity-node: grid [18px 1fr auto], gap-2.5, padding, rounded, bg
        'grid items-center gap-2.5 px-3 py-2.5 rounded-md bg-surface-canvas shadow-subtle text-left w-full',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        'disabled:opacity-40 disabled:pointer-events-none',
        isActive && 'bg-accent-primary/5 ring-1 ring-inset ring-accent-primary/40',
      )}
      style={{ gridTemplateColumns: '18px 1fr auto' }}
    >
      {/* Avatar or placeholder circle */}
      {user !== undefined ? (
        <UserAvatar user={user} size="sm" />
      ) : (
        // Placeholder (e.g. "(미지정)") — dashed circle
        <span
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted"
          aria-hidden="true"
        />
      )}

      {/* Label column */}
      <span className="flex flex-col min-w-0">
        {/* .entity-node-title */}
        <span className="text-xs font-medium text-text-primary leading-none truncate">
          {displayName}
        </span>
        {/* .entity-node-meta */}
        {meta !== undefined && (
          <span className="text-[10px] text-text-muted leading-none mt-0.5 truncate">
            {meta}
          </span>
        )}
      </span>

      {/* Check mark when active */}
      {isActive ? (
        <Check size={12} className="text-accent-primary shrink-0" aria-hidden="true" />
      ) : (
        <span className="w-3 h-3 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
