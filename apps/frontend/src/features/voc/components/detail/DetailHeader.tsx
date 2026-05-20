// DetailHeader — panel header wired with canonical VOC URL + expand toggle.

import * as React from 'react';
import { DetailPanelHeader, DetailPanelHeaderActions } from '@fops/ui';

export interface DetailHeaderProps {
  vocId: string;
  displayId: string;
  onClose: () => void;
  onExpandToggle?: () => void;
}

export function DetailHeader({
  vocId,
  displayId,
  onClose,
  onExpandToggle,
}: DetailHeaderProps): React.ReactElement {
  const canonicalUrl = `${window.location.origin}/vocs?view=inbox&selected=${vocId}`;

  return (
    <DetailPanelHeader
      kind="voc"
      id={displayId}
      onClose={onClose}
      extras={
        <DetailPanelHeaderActions
          entityKind="voc"
          entityId={displayId}
          copyUrl={canonicalUrl}
          {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
        />
      }
    />
  );
}
