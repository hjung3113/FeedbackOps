// ComposerTabs — three-tab strip for the detail panel composer.
//
// C5.1 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:400-414
//
// Prototype JSX (verbatim, lines 404-413):
//   <div className="composer-tabs">
//     <button className={`composer-tab ${composerTab === 'public' ? 'active public' : ''}`}
//       onClick={() => setComposerTab('public')}>
//       <Icon name="megaphone" size={11} style={{ marginRight: 6 }} />Public update
//     </button>
//     <button className={`composer-tab ${composerTab === 'reply' ? 'active reply' : ''}`}
//       onClick={() => setComposerTab('reply')}>Reporter reply</button>
//     <button className={`composer-tab ${composerTab === 'internal' ? 'active internal' : ''}`}
//       onClick={() => setComposerTab('internal')}>Internal note</button>
//   </div>
//
// Pack 17 mapping (PROTOTYPE-TO-PACK17.md §3.4):
//   .composer-tabs    → flex border-b border-border-subtle bg-surface-card
//   .composer-tab     → flex-1 py-2 px-2.5 text-xs font-medium text-text-muted text-center border-b border-transparent
//   .active           → text-text-primary bg-surface-canvas
//   .active.public    → border-b-accent-primary
//   .active.reply     → border-b-accent-info
//   .active.internal  → border-b-status-reporter-assigned

import * as React from 'react';
import type { ComposerSurface } from '@/features/voc/hooks/useComposerDraft';
import type { ComposerVisibility } from '@/features/voc/hooks/useComposerVisibility';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ComposerTabsProps {
  visibility: ComposerVisibility;
  activeTab: ComposerSurface;
  onTabChange: (surface: ComposerSurface) => void;
}

// ── Per-tab config ────────────────────────────────────────────────────────────

interface TabConfig {
  surface: ComposerSurface;
  label: string;
  activeBorderClass: string;
  visibilityKey: keyof ComposerVisibility;
}

const TAB_CONFIGS: TabConfig[] = [
  {
    surface: 'public',
    label: 'Public update',
    activeBorderClass: 'border-b-accent-primary',
    visibilityKey: 'showPublic',
  },
  {
    surface: 'reply',
    label: 'Reporter reply',
    activeBorderClass: 'border-b-accent-info',
    visibilityKey: 'showReply',
  },
  {
    surface: 'internal',
    label: 'Internal note',
    activeBorderClass: 'border-b-status-reporter-assigned',
    visibilityKey: 'showInternal',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ComposerTabs({
  visibility,
  activeTab,
  onTabChange,
}: ComposerTabsProps): React.ReactElement {
  const visibleTabs = TAB_CONFIGS.filter((t) => visibility[t.visibilityKey]);

  return (
    // composer-tabs: flex; border-bottom: 1px solid var(--border-subtle); background: var(--color-graphite)
    <div
      className="flex border-b border-border-subtle bg-surface-card"
      role="tablist"
      aria-label="Composer tabs"
    >
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.surface;
        return (
          <button
            key={tab.surface}
            role="tab"
            aria-selected={isActive}
            className={[
              // composer-tab base: flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 500;
              // color: var(--text-muted); text-align: center; border-bottom: 1px solid transparent
              'flex-1 py-2 px-2.5 text-xs font-medium text-center border-b border-b-transparent',
              'whitespace-nowrap transition-colors',
              isActive
                ? `text-text-primary bg-surface-canvas ${tab.activeBorderClass}`
                : 'text-text-muted hover:bg-surface-card hover:text-text-primary',
            ]
              .join(' ')
              .trim()}
            onClick={() => onTabChange(tab.surface)}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
