// AttachmentDropzone — active multi-file upload (PLAN-22 C6).
//
// Replaces the prior disabled/deferred state. On drop / file-pick each file is
// POSTed via `attachmentsApi.uploadAttachment(file, { idempotencyKey })` with a
// per-file Idempotency-Key minted at row creation. Rows surface their own
// state (`pending → uploading → uploaded | error`). The parent receives only
// IDs of `uploaded` rows via `onChange(serverAttachmentIds)`.
//
// Prototype mirror (verbatim copy):
// docs/design-prototype/screen-voc-create.jsx:146-194 (FieldLabel "첨부",
// dropzone-compact, multi-file <input>, AttachmentRow rendering, max-25MB).
// AttachmentRow (icon mapping, oversize / pending / uploaded state, remove
// button, formatFileSize) mirrors screen-voc-create.jsx:285-340.

import { FieldLabel, cn } from '@fops/ui';
import { Check, FileText, Paperclip, X } from 'lucide-react';
import type * as React from 'react';

import { formatFileSize } from '@/features/voc/lib/format-file-size';
import {
  type AttachmentUploadQueueRow,
  useAttachmentUploadQueue,
} from '@/lib/attachments/useAttachmentUploadQueue';

// Korean copy is verbatim from prototype lines 148, 170, 172.
const COPY = {
  fieldLabel: '첨부',
  fieldTip: '최대 25MB. 큰 스프레드시트는 본문이 아니라 파일 첨부로 저장됩니다.',
  dropHint: '파일을 드래그하거나 클릭해서 추가',
  footer: '최대 25MB · 다중 선택',
  removeTitle: '첨부 제거',
} as const;

export interface AttachmentDropzoneProps {
  testId?: string;
  /** Receives the list of successfully-uploaded server attachment IDs. */
  onChange?: (serverAttachmentIds: string[]) => void;
  /** Receives true while ANY row is mid-upload so parent can disable submit. */
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * PLAN-22 §Bug-3 (2026-05-22): receives the count of rows currently in
   * `error` state (per-file size cap, unsupported type, or upload failure).
   * Parent uses this to surface an inline submit-blocked alert; the dropzone
   * itself does NOT render the alert (the parent owns the action bar).
   */
  onErrorCountChange?: (errorCount: number) => void;
}

// formatFileSize moved to lib/format-file-size.ts (PLAN-22 §Bug-1, 2026-05-22)
// so the detail-panel AttachmentChip can reuse the same B/KB/MB rendering.

export function AttachmentDropzone({
  testId,
  onChange,
  onUploadingChange,
  onErrorCountChange,
}: AttachmentDropzoneProps): React.ReactElement {
  const queue = useAttachmentUploadQueue({
    ...(onChange ? { onChange } : {}),
    ...(onUploadingChange ? { onUploadingChange } : {}),
    ...(onErrorCountChange ? { onErrorCountChange } : {}),
  });
  const {
    rows,
    dragOver,
    inputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleInputChange,
    removeRow,
  } = queue;

  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <FieldLabel tip={COPY.fieldTip}>{COPY.fieldLabel}</FieldLabel>

      {/* Dropzone */}
      {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor wires to the hidden input via id */}
      <label
        htmlFor="attachment-dropzone-input"
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border-subtle px-3.5 py-3 transition-colors',
          'hover:border-border-selected hover:bg-accent-primary/5',
          dragOver && 'border-accent-primary bg-accent-primary/5',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={testId ? `${testId}-drop` : undefined}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-row-selected text-accent-primary"
          aria-hidden
        >
          <Paperclip className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 text-sm text-text-primary">{COPY.dropHint}</span>
        <span className="flex-1" />
        <span className="hidden text-xs text-text-muted sm:inline">{COPY.footer}</span>
        <input
          ref={inputRef}
          id="attachment-dropzone-input"
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
          data-testid={testId ? `${testId}-input` : undefined}
        />
      </label>

      {/* Row list */}
      {rows.length > 0 && (
        <ul
          className="mt-2 flex flex-col gap-1.5"
          data-testid={testId ? `${testId}-rows` : undefined}
        >
          {rows.map((row) => (
            <AttachmentRow key={row.rowId} row={row} onRemove={() => removeRow(row.rowId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface AttachmentRowProps {
  row: AttachmentUploadQueueRow;
  onRemove: () => void;
}

function AttachmentRow({ row, onRemove }: AttachmentRowProps): React.ReactElement {
  const sizeText = formatFileSize(row.file.size);
  let statusText: React.ReactNode;
  if (row.state.kind === 'uploading') {
    statusText = <span className="ml-1.5 text-text-muted">· 업로드 중</span>;
  } else if (row.state.kind === 'uploaded') {
    statusText = (
      <span className="ml-1.5 inline-flex items-center gap-1 text-text-muted">
        <Check className="h-3 w-3" aria-hidden data-testid="attachment-row-check" /> 업로드 완료
      </span>
    );
  } else {
    statusText = <span className="ml-1.5 text-text-danger">· {row.state.message}</span>;
  }

  // Remove button hidden while uploading (per spec — block remove until terminal).
  const showRemove = row.state.kind !== 'uploading';

  return (
    <li
      className="flex items-center gap-2.5 rounded-md bg-surface-card-elevated px-2.5 py-2 shadow-sm"
      data-testid="attachment-row"
      data-state={row.state.kind}
      data-error-code={row.state.kind === 'error' ? row.state.code : undefined}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-popover text-text-muted"
        aria-hidden
      >
        <FileText className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{row.file.name}</span>
        <span className="text-xs">
          <span className="text-text-muted">{sizeText}</span>
          {statusText}
        </span>
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-text-muted hover:bg-surface-raised"
          aria-label="첨부 제거"
          title="첨부 제거"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}
