// AttachmentDropzone — visible but disabled.
// Spec: drag-over highlight + no-op drop/click + sonner toast informing the
// user that attachments arrive in the next slice.

import * as React from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Card, cn } from '@fops/ui';

export interface AttachmentDropzoneProps {
  testId?: string;
}

const DEFER_MESSAGE = '첨부 기능은 다음 슬라이스에서 제공됩니다 (Slice 3+)';

export function AttachmentDropzone({ testId }: AttachmentDropzoneProps): React.ReactElement {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(): void {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    toast(DEFER_MESSAGE);
  }

  function handleClick(): void {
    toast(DEFER_MESSAGE);
    // Do NOT open the file dialog
  }

  function handleInputChange(): void {
    // no-op — input is never shown; this is here for completeness
  }

  return (
    <Card
      data-testid={testId}
      className={cn(
        'flex cursor-not-allowed flex-col gap-2 p-4 opacity-50 transition-colors',
        dragOver && 'border-accent-primary opacity-70',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      aria-disabled="true"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Hidden file input — never activated */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInputChange}
      />

      {/* Label row */}
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
        <span>첨부 파일</span>
      </div>

      {/* Helper row */}
      <p className="text-sm text-text-muted">드래그 또는 클릭하여 업로드</p>

      {/* Footer row */}
      <p className="text-xs text-text-muted">최대 25MB · 첨부 기능은 다음 슬라이스</p>
    </Card>
  );
}
