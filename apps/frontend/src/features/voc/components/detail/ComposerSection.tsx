// ComposerSection — orchestrator mounting the tab strip + draft state + placeholder bodies.
//
// C5.1 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:400-470
//
// Composer bodies are intentional placeholders in this sub-chunk — real bodies
// arrive in C5.2 (PublicUpdateComposer), C5.3 (ReporterReplyComposer),
// and C5.4 (InternalCommentComposer).
//
// Mount point: VocDetailPanel renders <ComposerSection voc={voc} me={me} />
// between <ConversationTimeline> and <NextActionFooter>.

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';
import { useComposerVisibility } from '@/features/voc/hooks/useComposerVisibility';
import { useComposerDraft, type ComposerSurface } from '@/features/voc/hooks/useComposerDraft';
import { ComposerTabs } from './ComposerTabs';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ComposerSectionProps {
  voc: VocDetailEnvelope;
  me: MeResponse | null | undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComposerSection({ voc, me }: ComposerSectionProps): React.ReactElement | null {
  const visibility = useComposerVisibility(voc, me);
  // Draft state is wired here; placeholder bodies in C5.1 don't use it yet.
  // C5.2/C5.3/C5.4 will pass draft.getDraft / draft.setDraft into the real composer bodies.
  const _draft = useComposerDraft(voc.id);

  // Determine the default (leftmost visible) tab surface.
  function getDefaultTab(): ComposerSurface {
    if (visibility?.showPublic) return 'public';
    if (visibility?.showReply) return 'reply';
    return 'internal';
  }

  const [activeTab, setActiveTab] = React.useState<ComposerSurface>(getDefaultTab);

  // When vocId changes reset tab to the new default leftmost.
  const prevVocIdRef = React.useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    setActiveTab(getDefaultTab());
  }

  // No visible tabs → render nothing.
  if (!visibility) return null;

  return (
    <div
      className="border-t border-border-subtle"
      data-testid="composer-section"
    >
      <ComposerTabs
        visibility={visibility}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Composer bodies — placeholders until C5.2/C5.3/C5.4 */}
      <div className="p-4">
        {activeTab === 'public' && visibility.showPublic && (
          <div data-testid="composer-public-placeholder">TODO: PublicUpdateComposer</div>
        )}
        {activeTab === 'reply' && visibility.showReply && (
          <div data-testid="composer-reply-placeholder">TODO: ReporterReplyComposer</div>
        )}
        {activeTab === 'internal' && visibility.showInternal && (
          <div data-testid="composer-internal-placeholder">TODO: InternalCommentComposer</div>
        )}
      </div>

    </div>
  );
}
