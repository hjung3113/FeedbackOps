// ComposerSection — orchestrator mounting the tab strip + draft state + composer bodies.
//
// C5.1 (slice3 #21) — infrastructure (tabs, draft state, visibility)
// C5.2 (slice3 #21) — PublicUpdateComposer wired (replaces placeholder)
// C5.3 (slice3 #21) — ReporterReplyComposer wired (replaces placeholder)
// C5.4 (slice3 #21) — InternalCommentComposer wired (replaces placeholder)
// C5.5 (slice3 #21) — DirtyConfirmation on panel close with dirty draft ← THIS CHUNK
// REV-1 #6 — onDirtyChange callback added so VocDetailPanel can intercept panel close.
// REV-1 #7 — useComposerDraft wired into all three composers; all kept mounted with
//            visibility toggled via CSS display so drafts survive tab switches.
//
// Spec: PLAN-21-SUBCHUNKS.md C5.1 / C5.2 / C5.5
// Prototype ref: docs/design-prototype/screen-voc.jsx:400-470
//
// Mount point: FullDetailView renders this with voc, me, and canTriage between
// <ConversationTimeline> and <NextActionFooter>.
//
// DirtyConfirmation: when onCloseRequest fires and any composer has a dirty (non-empty)
// draft, show DirtyConfirmation before completing the close. Draft dirtiness is tracked
// via a shared ref that each composer signals upward via the `onDirtyChange` callback.

import { type ComposerSurface, useComposerDraft } from '@/features/voc/hooks/useComposerDraft';
import { useComposerVisibility } from '@/features/voc/hooks/useComposerVisibility';
import type { MeResponse } from '@/lib/auth/useMe';
import { type VocDetailEnvelope, isTipTapDocStructurallyEmpty } from '@fops/shared';
import { DirtyConfirmation } from '@fops/ui';
import { X } from 'lucide-react';
import * as React from 'react';
import { ComposerTabs } from './ComposerTabs';
import { InternalCommentComposer } from './InternalCommentComposer';
import { PublicUpdateComposer } from './PublicUpdateComposer';
import { ReporterReplyComposer } from './ReporterReplyComposer';

function isFocusInActiveComposer(
  section: HTMLDivElement | null,
  target: EventTarget | null,
  surface: ComposerSurface,
): boolean {
  if (!(target instanceof Node) || !section) return false;

  const selectedTab = section.querySelector<HTMLButtonElement>(
    '[role="tab"][aria-selected="true"]',
  );
  const activeComposer = section.querySelector<HTMLElement>(`[data-composer-surface="${surface}"]`);
  return selectedTab?.contains(target) === true || activeComposer?.contains(target) === true;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ComposerSectionProps {
  voc: VocDetailEnvelope;
  me: MeResponse | null | undefined;
  canTriage?: boolean;
  /**
   * Optional close handler provided by the parent panel. When present, a close
   * button (닫기) is rendered and dirty-draft confirmation is gated before the
   * actual close fires.
   */
  onCloseRequest?: () => void;
  /**
   * REV-1 #6: called whenever the aggregate dirty state of the composer section
   * changes. The parent panel (VocDetailPanel) uses this to intercept its own
   * close button and show DirtyConfirmation before closing the panel.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComposerSection({
  voc,
  me,
  canTriage = false,
  onCloseRequest,
  onDirtyChange,
}: ComposerSectionProps): React.ReactElement | null {
  const visibility = useComposerVisibility(voc, me, canTriage);
  // REV-1 #7: draft state is now wired into all three composers as controlled props.
  const draft = useComposerDraft(voc.id);

  // Determine the default (leftmost visible) tab surface.
  function getDefaultTab(): ComposerSurface {
    if (visibility?.showPublic) return 'public';
    if (visibility?.showReply) return 'reply';
    return 'internal';
  }

  function isSurfaceVisible(surface: ComposerSurface): boolean {
    if (surface === 'public') return visibility?.showPublic === true;
    if (surface === 'reply') return visibility?.showReply === true;
    return visibility?.showInternal === true;
  }

  const [activeTab, setActiveTab] = React.useState<ComposerSurface>(getDefaultTab);
  const effectiveActiveTab = isSurfaceVisible(activeTab) ? activeTab : getDefaultTab();
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = React.useState(false);
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const focusWasInActiveSurfaceRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!visibility) return;

    if (activeTab !== effectiveActiveTab) {
      setActiveTab(effectiveActiveTab);
      if (focusWasInActiveSurfaceRef.current) {
        sectionRef.current
          ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
          ?.focus();
      }
      focusWasInActiveSurfaceRef.current = false;
      return;
    }

    focusWasInActiveSurfaceRef.current = isFocusInActiveComposer(
      sectionRef.current,
      sectionRef.current?.ownerDocument.activeElement ?? null,
      activeTab,
    );
  }, [activeTab, effectiveActiveTab, visibility]);

  // REV-2 #6: dirty is derived from the controlled draft state (the same
  // TipTapDoc each composer passes through onDraftChange), not from a
  // container onClick. Keyboard-only typing now flows through onChange →
  // useComposerDraft → this derivation, so close always sees the correct
  // dirty state regardless of pointer interaction.
  const isDirty =
    !isTipTapDocStructurallyEmpty(draft.state.public) ||
    !isTipTapDocStructurallyEmpty(draft.state.reply) ||
    !isTipTapDocStructurallyEmpty(draft.state.internal);

  // Reset tab when VOC changes (drafts auto-clear via useComposerDraft).
  const prevVocIdRef = React.useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    setActiveTab(getDefaultTab());
  }

  // REV-1 #6: notify parent panel whenever dirty state changes.
  // Use a ref to avoid stale closure issues in the effect dep array.
  const onDirtyChangeRef = React.useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  React.useEffect(() => {
    onDirtyChangeRef.current?.(isDirty);
  }, [isDirty]);

  // No visible tabs → render nothing.
  if (!visibility) return null;

  function handleCloseRequest() {
    if (isDirty) {
      setDirtyConfirmOpen(true);
    } else {
      onCloseRequest?.();
    }
  }

  function handleDirtyConfirm() {
    setDirtyConfirmOpen(false);
    // Clear all drafts so the next render's isDirty derivation flips to false.
    draft.clearAll();
    onCloseRequest?.();
  }

  function handleDirtyCancel() {
    setDirtyConfirmOpen(false);
  }

  return (
    <div
      ref={sectionRef}
      className="border-t border-border-subtle"
      data-testid="composer-section"
      onFocusCapture={(event) => {
        focusWasInActiveSurfaceRef.current = isFocusInActiveComposer(
          sectionRef.current,
          event.target,
          effectiveActiveTab,
        );
      }}
      onBlurCapture={(event) => {
        if (activeTab !== effectiveActiveTab) return;
        focusWasInActiveSurfaceRef.current = isFocusInActiveComposer(
          sectionRef.current,
          event.relatedTarget,
          effectiveActiveTab,
        );
      }}
    >
      {/* Section header with optional close button */}
      {onCloseRequest && (
        <div className="flex items-center justify-end px-4 pt-2">
          <button
            type="button"
            onClick={handleCloseRequest}
            aria-label="닫기"
            className="inline-flex items-center justify-center h-6 w-6 rounded text-text-muted hover:text-text-primary hover:bg-surface-row-hover"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <ComposerTabs
        visibility={visibility}
        activeTab={effectiveActiveTab}
        onTabChange={setActiveTab}
      />

      {/* Composer bodies — all three kept mounted (display toggled) so drafts survive tab
          switches. REV-1 #7: draft state controlled by parent via useComposerDraft.
          REV-2 #6: no onClick dirty handler — dirty is derived from draft state above. */}
      <div className="p-4">
        {visibility.showPublic && (
          <div
            data-composer-surface="public"
            hidden={effectiveActiveTab !== 'public'}
          >
            <PublicUpdateComposer
              voc={voc}
              me={me}
              draftDoc={draft.state.public}
              onDraftChange={(doc) => draft.setDraft('public', doc)}
            />
          </div>
        )}
        {visibility.showReply && (
          <div
            data-composer-surface="reply"
            hidden={effectiveActiveTab !== 'reply'}
          >
            <ReporterReplyComposer
              voc={voc}
              me={me}
              draftDoc={draft.state.reply}
              onDraftChange={(doc) => draft.setDraft('reply', doc)}
            />
          </div>
        )}
        {visibility.showInternal && (
          <div
            data-composer-surface="internal"
            hidden={effectiveActiveTab !== 'internal'}
          >
            <InternalCommentComposer
              voc={voc}
              me={me}
              draftDoc={draft.state.internal}
              onDraftChange={(doc) => draft.setDraft('internal', doc)}
            />
          </div>
        )}
      </div>

      {/* DirtyConfirmation dialog — shown when close is requested with a dirty draft */}
      <DirtyConfirmation
        open={dirtyConfirmOpen}
        onConfirm={handleDirtyConfirm}
        onCancel={handleDirtyCancel}
      />
    </div>
  );
}
