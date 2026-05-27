// ConversationTimeline — tabbed public / internal conversation view.

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import {
  PanelSectionTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@fops/ui';
import { PublicTimeline } from './PublicTimeline';
import { InternalTimeline } from './InternalTimeline';

export interface ConversationTimelineProps {
  voc: VocDetailEnvelope;
}

export function ConversationTimeline({ voc }: ConversationTimelineProps): React.ReactElement {
  const publicEntries = voc.conversation_timeline.filter(
    (e) => e.kind === 'public_update' || e.kind === 'reporter_reply',
  );
  const internalEntries = voc.conversation_timeline.filter(
    (e) => e.kind === 'internal_comment',
  );

  // TODO(#21): Hide the "내부" tab when viewer is Reporter-only. Server already
  // returns empty internal_comment array for Reporter-only viewers, but rendering
  // the tab still hints at the existence of internal traffic they aren't meant
  // to know about. REV-1 cycle 1 M1 — deferred to #21 alongside composer +
  // permission-aware viewer logic (needs useMe + voc.reporter_id comparison +
  // role_level check).
  return (
    <div>
      <PanelSectionTitle>대화</PanelSectionTitle>
      <Tabs defaultValue="public" className="w-full">
        <TabsList>
          <TabsTrigger value="public">공개</TabsTrigger>
          <TabsTrigger value="internal">내부</TabsTrigger>
        </TabsList>
        <TabsContent value="public">
          <PublicTimeline
            vocId={voc.id}
            inline={publicEntries}
            hasMore={voc.conversation_page.has_more}
          />
        </TabsContent>
        <TabsContent value="internal">
          <InternalTimeline
            vocId={voc.id}
            inline={internalEntries}
            hasMore={voc.conversation_page.has_more}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
