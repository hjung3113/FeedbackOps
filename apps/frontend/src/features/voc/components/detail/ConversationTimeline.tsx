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
  canTriage: boolean;
  actorNamesById?: ReadonlyMap<string, string> | undefined;
}

export function ConversationTimeline({
  voc,
  canTriage,
  actorNamesById,
}: ConversationTimelineProps): React.ReactElement {
  const [selectedTab, setSelectedTab] = React.useState<'public' | 'internal'>('public');
  const publicTabRef = React.useRef<HTMLButtonElement>(null);
  const internalTabRef = React.useRef<HTMLButtonElement>(null);
  const internalContentRef = React.useRef<HTMLDivElement>(null);
  const focusWasInInternalRef = React.useRef(false);
  const previousCanTriageRef = React.useRef(canTriage);

  React.useLayoutEffect(() => {
    if (!canTriage) {
      setSelectedTab('public');
      if (previousCanTriageRef.current && focusWasInInternalRef.current) {
        publicTabRef.current?.focus();
      }
    }
    previousCanTriageRef.current = canTriage;
  }, [canTriage]);

  const publicEntries = voc.conversation_timeline.filter(
    (e) => e.kind === 'public_update' || e.kind === 'reporter_reply',
  );
  const internalEntries = voc.conversation_timeline.filter(
    (e) => e.kind === 'internal_comment',
  );

  return (
    <div>
      <PanelSectionTitle>대화</PanelSectionTitle>
      <Tabs
        value={canTriage ? selectedTab : 'public'}
        onValueChange={(value) => setSelectedTab(value as 'public' | 'internal')}
        className="w-full"
        onFocusCapture={(event: React.FocusEvent<HTMLDivElement>) => {
          const target = event.target;
          focusWasInInternalRef.current =
            target instanceof Node &&
            (internalTabRef.current?.contains(target) === true ||
              internalContentRef.current?.contains(target) === true);
        }}
        onBlurCapture={(event: React.FocusEvent<HTMLDivElement>) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node)) {
            if (canTriage) focusWasInInternalRef.current = false;
            return;
          }
          if (!event.currentTarget.contains(nextTarget)) {
            if (canTriage) focusWasInInternalRef.current = false;
            return;
          }
          focusWasInInternalRef.current =
            internalTabRef.current?.contains(nextTarget) === true ||
            internalContentRef.current?.contains(nextTarget) === true;
        }}
      >
        <TabsList>
          <TabsTrigger ref={publicTabRef} value="public">
            공개
          </TabsTrigger>
          {canTriage && (
            <TabsTrigger ref={internalTabRef} value="internal">
              내부
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="public">
          <PublicTimeline
            vocId={voc.id}
            inline={publicEntries}
            hasMore={voc.conversation_page.has_more}
            actorNamesById={actorNamesById}
          />
        </TabsContent>
        {canTriage && (
          <TabsContent ref={internalContentRef} value="internal">
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
