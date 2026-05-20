// DescriptionSection — rich description display with optional edit placeholder.

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import { PanelSectionTitle, NestedTextBlock, RichContentRenderer, type TipTapDoc } from '@fops/ui';
import { EditDescriptionLink } from './EditDescriptionLink';

export interface DescriptionSectionProps {
  voc: VocDetailEnvelope;
  /** Pre-computed by parent: me.actor.id === voc.reporter_id && voc.triage_state === 'untriaged' */
  isReporterOnOwnVoc: boolean;
}

export function DescriptionSection({
  voc,
  isReporterOnOwnVoc,
}: DescriptionSectionProps): React.ReactElement {
  return (
    <div>
      <PanelSectionTitle>설명</PanelSectionTitle>
      <NestedTextBlock>
        <RichContentRenderer doc={voc.description_rich_content as TipTapDoc} mode="internal" />
      </NestedTextBlock>
      {isReporterOnOwnVoc && <EditDescriptionLink />}
    </div>
  );
}
