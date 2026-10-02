// ComposerAttachmentDropzone — compact attachment dropzone for the three
// Triage composers (PublicUpdate / InternalComment / ReporterReply).
//
// PLAN-22 C7a.
//
// Mirrors C6's <AttachmentDropzone> per-row state machine (pending →
// uploading → uploaded | error) and onChange / onUploadingChange contract.
// The compact variant drops the "첨부" FieldLabel + Card chrome since the
// composer container already implies the attachment context, and renders
// with tighter spacing to fit below the RichEditor body.
//
// Prototype anchor: docs/design-prototype/screen-voc-triage.jsx ComposerSection
// + screen-voc-detail-reporter.jsx Reply composer. Copy strings ("파일을 드래그하거나
// 클릭해서 추가", "최대 25MB · 다중 선택") are verbatim from screen-voc-create.jsx
// per C6.
//
// D1: parent sends the uploaded ids via `attachment_ids: string[]` on the
// composer POST body (widened from legacy `attachments: AttachmentRef[]` —
// schema is reconciled in C7b).

import { cn } from '@fops/ui';
import { Check, Paperclip, X } from 'lucide-react';
import type * as React from 'react';

import { formatFileSize } from '@/features/voc/lib/format-file-size';
import {
  type AttachmentUploadQueueRow,
  useAttachmentUploadQueue,
} from '@/lib/attachments/useAttachmentUploadQueue';

const COPY = {
  dropHint: '파일을 드래그하거나 클릭해서 추가',
  footer: '최대 25MB · 다중 선택',
  removeTitle: '첨부 제거',
} as const;

export interface ComposerAttachmentDropzoneProps {
  /**
   * Unique testid prefix per composer surface
   * (e.g. "public-update-attachment-dropzone").
   */
  testId: string;
  onChange?: (serverAttachmentIds: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * #354: bump this after a successful post to drop the rows whose attachments
   * the server has now linked to the published item. Only `uploaded` rows are
   * dropped — a row still uploading (the user may add files while the post is
   * in flight) and a row that failed both stay, so nothing is silently lost.
   */
  resetToken?: number;
}

// formatFileSize moved to lib/format-file-size.ts (PLAN-22 §Bug-1, 2026-05-22).

export function ComposerAttachmentDropzone({
  testId,
  onChange,
  onUploadingChange,
  resetToken,
}: ComposerAttachmentDropzoneProps): React.ReactElement {
  const queue = useAttachmentUploadQueue({
    ...(onChange ? { onChange } : {}),
    ...(onUploadingChange ? { onUploadingChange } : {}),
    ...(resetToken === undefined ? {} : { resetToken }),
  });
  const {
    rows,
    dragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleInputChange,
    removeRow,
  } = queue;

  const inputId = `${testId}-input-control`;

  return (
    <div data-testid={testId} className="flex flex-col gap-1.5 px-3 pb-2">
      {/* Compact dropzone — no FieldLabel; composer context implies "첨부" */}
      {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor wires to hidden input */}
      <label
        htmlFor={inputId}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-subtle px-2.5 py-1.5 transition-colors',
          dragOver && 'border-accent-primary bg-accent-primary/5',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`${testId}-drop`}
      >
        <Paperclip className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />
        <span className="text-xs text-text-primary">{COPY.dropHint}</span>
        <span className="flex-1" />
        <span className="text-[11px] text-text-muted">{COPY.footer}</span>
        <input
          id={inputId}
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
          data-testid={`${testId}-input`}
        />
      </label>

      {rows.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1" data-testid={`${testId}-rows`}>
          {rows.map((row) => (
            <AttachmentRow key={row.rowId} row={row} onRemove={() => removeRow(row.rowId)} />
          ))}
        </ul>
      )}
    </div>
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
  const showRemove = row.state.kind !== 'uploading';

  return (
    <li
      className="flex items-center gap-2 rounded-md bg-surface-card px-2 py-1.5"
      data-testid="attachment-row"
      data-state={row.state.kind}
      data-error-code={row.state.kind === 'error' ? row.state.code : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">{row.file.name}</span>
        <span className="text-[11px]">
          <span className="text-text-muted">{sizeText}</span>
          {statusText}
        </span>
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-text-muted hover:bg-surface-raised"
          aria-label="첨부 제거"
          title="첨부 제거"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </li>
  );
}
