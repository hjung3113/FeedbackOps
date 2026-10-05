import { PanelSectionTitle, StatusBadgeFrame } from '@fops/ui';
import type * as React from 'react';

// Milestone-local presentation wrappers for the #514 final fidelity pass
// (.review/fix-514-pixel-final-fidelity-prompt.txt). The shared pill/badge/
// avatar primitives render the roomier defaults (rounded-full, 12px
// semibold/primary text, muted mark); the milestone surfaces need the
// prototype's compact .badge geometry (docs/design-prototype/styles.css:
// 20px height, 6px padding, 4px radius, --text-tiny 11px, weight 500,
// transparent + --shadow-subtle). Badge and avatar geometry remains local to
// milestones; the repeated title scale uses PanelSectionTitle's named variant.

// Label → identity token mapping follows the established pattern in
// packages/ui/src/components/ChipPicker.tsx (managedSystemColorToken); that
// helper is module-private, so this milestone-local copy mirrors it and names
// that file as the source of truth. Tokens per ADR-0021 — never inline
// prototype hex; unknown systems fall back to --managed-system-default.
function managedSystemToken(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes('tableau')) return '--managed-system-tableau';
  if (normalized.includes('power bi') || normalized.includes('power-bi')) {
    return '--managed-system-power-bi';
  }
  if (normalized.includes('looker')) return '--managed-system-looker';
  if (normalized.includes('metabase')) return '--managed-system-metabase';
  return '--managed-system-default';
}

// Prototype ManagedSystemPill (badges.jsx): compact badge, secondary text,
// 6px round dot in the system's semantic identity color.
export function MilestoneManagedSystemPill({ name }: { name: string }) {
  return (
    <StatusBadgeFrame
      appearance="compact-identity"
      style={
        {
          '--milestone-managed-system-color': `rgb(var(${managedSystemToken(name)}) / 1)`,
        } as React.CSSProperties
      }
      indicator={
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-(--radius-pill) bg-(--milestone-managed-system-color)"
        />
      }
    >
      {name}
    </StatusBadgeFrame>
  );
}

// Prototype OutlineBadge (badges.jsx): compact badge on transparent surface;
// the .badge muted text stays (the shared badge's primary/semibold look was
// the fidelity deviation).
export function MilestoneOutlineBadge({ children }: { children: React.ReactNode }) {
  return <StatusBadgeFrame appearance="compact-outline">{children}</StatusBadgeFrame>;
}

// Prototype owner avatar geometry (styles.css .avatar-sm): 18px circle,
// white 9px initial. AvatarUser carries only display_name — no per-person
// color exists in the DTO shape, so the prototype's per-person tints are a
// recorded data-shape limitation, not an authorized design deviation. Every
// milestone avatar uses the single semantic fallback fill --color-aether-blue.
export function MilestoneOwnerAvatar({ name }: { name: string }) {
  return (
    <span className="grid size-4.5 shrink-0 place-items-center rounded-(--radius-pill) bg-accent-primary text-micro font-semibold leading-none text-white">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// Prototype UserChip (panel.jsx): avatar + name on a 6px axis. The name uses
// the inherited 13px body typography and 1.4 line height.
export function MilestoneOwnerChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <MilestoneOwnerAvatar name={name} />
      <span className="text-sm leading-body text-text-primary">{name}</span>
    </span>
  );
}

// Prototype section title scale (styles.css .panel-section-title 11px;
// panel.jsx title wrapper 10px bottom rhythm). Source keeps mb-0 via
// className — the 10px gap is owned by the card's mt-2.5.
export function MilestonePanelSectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <PanelSectionTitle
      size="tiny"
      className={className !== undefined ? `mb-2.5 ${className}` : 'mb-2.5'}
    >
      {children}
    </PanelSectionTitle>
  );
}
