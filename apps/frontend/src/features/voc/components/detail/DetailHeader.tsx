// DetailHeader — panel header wired with the canonical VOC URL.

import { DetailPanelHeader, DetailPanelHeaderActions } from '@fops/ui';
import type * as React from 'react';

export interface DetailHeaderProps {
  vocId: string;
  displayId: string;
  onClose: () => void;
}

export function DetailHeader({ vocId, displayId, onClose }: DetailHeaderProps): React.ReactElement {
  const canonicalUrl = `${window.location.origin}/vocs?view=inbox&selected=${vocId}`;

  return (
    <DetailPanelHeader
      kind="voc"
      id={displayId}
      onClose={onClose}
      extras={
        <DetailPanelHeaderActions entityKind="voc" entityId={displayId} copyUrl={canonicalUrl} />
      }
    />
  );
}
