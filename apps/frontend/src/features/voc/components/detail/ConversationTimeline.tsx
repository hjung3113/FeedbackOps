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
  canSeeInternalOps: boolean;
  actorNamesById?: ReadonlyMap<string, string> | undefined;
}

export function ConversationTimeline({
  voc,
  canSeeInternalOps,
  actorNamesById,
}: ConversationTimelineProps): React.ReactElement {
  const publicEntries = voc.conversation_timeline.filter(
    (e) => e.kind === 'public_update' || e.kind === 'reporter_reply',
  );
  const internalEntries = voc.conversation_timeline.filter(
    (e) => e.kind === 'internal_comment',
  );

  return (
    <div>
      <PanelSectionTitle>대화</PanelSectionTitle>
      <Tabs defaultValue="public" className="w-full">
        <TabsList>
          <TabsTrigger value="public">공개</TabsTrigger>
          {canSeeInternalOps && <TabsTrigger value="internal">내부</TabsTrigger>}
        </TabsList>
        <TabsContent value="public">
          <PublicTimeline
            vocId={voc.id}
            inline={publicEntries}
            hasMore={voc.conversation_page.has_more}
            actorNamesById={actorNamesById}
          />
        </TabsContent>
        {canSeeInternalOps && (
          <TabsContent value="internal">
            <InternalTimeline
              vocId={voc.id}
              inline={internalEntries}
              hasMore={voc.conversation_page.has_more}
              actorNamesById={actorNamesById}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
