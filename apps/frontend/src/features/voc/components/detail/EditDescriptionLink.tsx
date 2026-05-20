// EditDescriptionLink — spec-locked placeholder (Slice 3).
// Renders a small link/button for #21's description edit feature.

import * as React from 'react';
import { toast } from 'sonner';

export function EditDescriptionLink(): React.ReactElement {
  function handleClick(): void {
    toast.info('수정은 다음 이슈에서 제공됩니다');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-1 text-xs text-text-muted underline hover:text-text-primary transition-colors"
    >
      설명 수정
    </button>
  );
}
