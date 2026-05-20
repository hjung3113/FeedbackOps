// DetailPanelNotFound — renders when the VOC returns a 404 / not_found.record.

import * as React from 'react';
import { Button } from '@fops/ui';

export interface DetailPanelNotFoundProps {
  onClearSelection: () => void;
}

export function DetailPanelNotFound({
  onClearSelection,
}: DetailPanelNotFoundProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <p className="text-base font-semibold text-text-primary">VOC를 찾을 수 없습니다.</p>
      <p className="text-sm text-text-muted">
        해당 VOC는 삭제되었거나 접근 권한이 없습니다.
      </p>
      <Button variant="outline" size="sm" onClick={onClearSelection}>
        선택 해제
      </Button>
    </div>
  );
}
