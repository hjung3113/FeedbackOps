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
import * as React from 'react';
import { toast } from 'sonner';

import { formatFileSize } from '@/features/voc/lib/format-file-size';
import { uploadAttachment } from '@/lib/api/attachments';
import { errorMapper } from '@/lib/api/errorMapper';
import type { ApiError } from '@/lib/api/types';

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

const COPY = {
  dropHint: '파일을 드래그하거나 클릭해서 추가',
  footer: '최대 25MB · 다중 선택',
  removeTitle: '첨부 제거',
  oversize: '첨부 파일 크기가 허용 한도를 초과했습니다.',
  unsupportedType: '허용되지 않는 파일 형식입니다.',
} as const;

type RowState =
  | { kind: 'uploading' }
  | { kind: 'uploaded'; serverId: string }
  | { kind: 'error'; code: string; message: string };

interface Row {
  rowId: string;
  file: File;
  idempotencyKey: string;
  state: RowState;
  abort: AbortController;
}

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

function mintRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `row-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function mintIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => (b ?? 0).toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

// formatFileSize moved to lib/format-file-size.ts (PLAN-22 §Bug-1, 2026-05-22).

// Module scope: it reads nothing from the component, and defining it inside
// made addFiles' empty dependency list a lint error (useExhaustiveDependencies).
function clientSideRejection(file: File): { code: string; message: string } | null {
  if (file.size > MAX_SIZE_BYTES) {
    return { code: 'attachment.too_large', message: COPY.oversize };
  }
  return null;
}

export function ComposerAttachmentDropzone({
  testId,
  onChange,
  onUploadingChange,
  resetToken,
}: ComposerAttachmentDropzoneProps): React.ReactElement {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [dragOver, setDragOver] = React.useState(false);

  const uploadedIds = React.useMemo(
    () =>
      rows
        .filter(
          (r): r is Row & { state: { kind: 'uploaded'; serverId: string } } =>
            r.state.kind === 'uploaded',
        )
        .map((r) => r.state.serverId),
    [rows],
  );
  const anyUploading = rows.some((r) => r.state.kind === 'uploading');

  const lastUploadedRef = React.useRef<string>('');
  const lastUploadingRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    const key = uploadedIds.join(',');
    if (lastUploadedRef.current !== key) {
      lastUploadedRef.current = key;
      onChange?.(uploadedIds);
    }
  }, [uploadedIds, onChange]);

  React.useEffect(() => {
    if (lastUploadingRef.current !== anyUploading) {
      lastUploadingRef.current = anyUploading;
      onUploadingChange?.(anyUploading);
    }
  }, [anyUploading, onUploadingChange]);

  // #354: the parent bumps resetToken after a successful post. Rows that are
  // still uploading or that errored are kept — only the linked ones go away.
  // Dropping them re-runs the uploadedIds effect above, so the parent's
  // attachment id list clears through the same onChange path as any other edit.
  React.useEffect(() => {
    if (resetToken === undefined) return;
    setRows((cur) =>
      cur.some((r) => r.state.kind === 'uploaded')
        ? cur.filter((r) => r.state.kind !== 'uploaded')
        : cur,
    );
  }, [resetToken]);

  const addFiles = React.useCallback((fileList: FileList | File[] | null): void => {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newRows: Row[] = files.map((file) => {
      const reject = clientSideRejection(file);
      const rowId = mintRowId();
      const idempotencyKey = mintIdempotencyKey();
      const abort = new AbortController();
      if (reject) {
        return {
          rowId,
          file,
          idempotencyKey,
          abort,
          state: { kind: 'error', code: reject.code, message: reject.message },
        };
      }
      return { rowId, file, idempotencyKey, abort, state: { kind: 'uploading' } };
    });

    setRows((prev) => [...prev, ...newRows]);

    for (const row of newRows) {
      if (row.state.kind !== 'uploading') continue;
      void (async () => {
        try {
          const result = await uploadAttachment(row.file, {
            idempotencyKey: row.idempotencyKey,
            signal: row.abort.signal,
          });
          setRows((cur) =>
            cur.map((r) =>
              r.rowId === row.rowId
                ? { ...r, state: { kind: 'uploaded', serverId: result.id } }
                : r,
            ),
          );
        } catch (err) {
          const apiErr = err as ApiError;
          if (apiErr.code === 'storage.unavailable') {
            const mapped = errorMapper(apiErr.envelope);
            toast.error(mapped.message);
          }
          let inlineMessage: string;
          if (apiErr.code === 'attachment.too_large') inlineMessage = COPY.oversize;
          else if (apiErr.code === 'attachment.unsupported_type')
            inlineMessage = COPY.unsupportedType;
          else {
            const mapped = errorMapper(
              apiErr.envelope ?? { code: 'internal.unexpected', message: '' },
            );
            inlineMessage = mapped.message;
          }
          setRows((cur) =>
            cur.map((r) =>
              r.rowId === row.rowId
                ? {
                    ...r,
                    state: {
                      kind: 'error',
                      code: apiErr.code ?? 'internal.unexpected',
                      message: inlineMessage,
                    },
                  }
                : r,
            ),
          );
        }
      })();
    }
  }, []);

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave(): void {
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files ?? null);
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function removeRow(rowId: string): void {
    setRows((cur) => {
      const row = cur.find((r) => r.rowId === rowId);
      if (row && row.state.kind === 'uploading') row.abort.abort();
      return cur.filter((r) => r.rowId !== rowId);
    });
  }

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
  row: Row;
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
