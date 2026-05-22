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

import { Card, cn } from '@fops/ui';
import { Check, Paperclip, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { uploadAttachment } from '@/lib/api/attachments';
import { errorMapper } from '@/lib/api/errorMapper';
import type { ApiError } from '@/lib/api/types';
import { formatFileSize } from '@/features/voc/lib/format-file-size';

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

// Korean copy is verbatim from prototype lines 148, 170, 172.
const COPY = {
  fieldLabel: '첨부',
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

function mintRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `row-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function mintIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older test envs — matches useIdempotencyKey.ts pattern.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => (b ?? 0).toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

// formatFileSize moved to lib/format-file-size.ts (PLAN-22 §Bug-1, 2026-05-22)
// so the detail-panel AttachmentChip can reuse the same B/KB/MB rendering.

export function AttachmentDropzone({
  testId,
  onChange,
  onUploadingChange,
  onErrorCountChange,
}: AttachmentDropzoneProps): React.ReactElement {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Notify parent of uploaded-id list + uploading flag whenever rows change.
  const uploadedIds = React.useMemo(
    () =>
      rows
        .filter((r): r is Row & { state: { kind: 'uploaded'; serverId: string } } => r.state.kind === 'uploaded')
        .map((r) => r.state.serverId),
    [rows],
  );
  const anyUploading = rows.some((r) => r.state.kind === 'uploading');

  // Refs to skip the initial mount-firing of useEffect (no-op notify on mount).
  const lastUploadedRef = React.useRef<string>('');
  const lastUploadingRef = React.useRef<boolean | null>(null);
  const lastErrorCountRef = React.useRef<number | null>(null);

  // PLAN-22 §Bug-3: track error rows so the parent can render an inline alert.
  const errorCount = rows.filter((r) => r.state.kind === 'error').length;
  React.useEffect(() => {
    if (lastErrorCountRef.current !== errorCount) {
      lastErrorCountRef.current = errorCount;
      onErrorCountChange?.(errorCount);
    }
  }, [errorCount, onErrorCountChange]);

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

  // Client-side reject BEFORE issuing the upload so the row reflects the
  // BE error code we'd otherwise have to round-trip for.
  function clientSideRejection(file: File): { code: string; message: string } | null {
    if (file.size > MAX_SIZE_BYTES) {
      return { code: 'attachment.too_large', message: COPY.oversize };
    }
    return null;
  }

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

    // Kick off uploads for the non-rejected rows.
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
          // Storage failure → toast in addition to per-row state.
          if (apiErr.code === 'storage.unavailable') {
            const mapped = errorMapper(apiErr.envelope);
            toast.error(mapped.message);
          }
          // Map known codes to inline row copy.
          let inlineMessage: string;
          if (apiErr.code === 'attachment.too_large') inlineMessage = COPY.oversize;
          else if (apiErr.code === 'attachment.unsupported_type') inlineMessage = COPY.unsupportedType;
          else {
            const mapped = errorMapper(apiErr.envelope ?? { code: 'internal.unexpected', message: '' });
            inlineMessage = mapped.message;
          }
          setRows((cur) =>
            cur.map((r) =>
              r.rowId === row.rowId
                ? {
                    ...r,
                    state: { kind: 'error', code: apiErr.code ?? 'internal.unexpected', message: inlineMessage },
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
    // Reset input so re-selecting the same file fires onChange again.
    e.target.value = '';
  }

  function removeRow(rowId: string): void {
    setRows((cur) => {
      const row = cur.find((r) => r.rowId === rowId);
      if (row && row.state.kind === 'uploading') row.abort.abort();
      return cur.filter((r) => r.rowId !== rowId);
    });
  }

  return (
    <Card
      data-testid={testId}
      className="flex flex-col gap-2 p-4"
    >
      {/* Label */}
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
        <span>{COPY.fieldLabel}</span>
      </div>

      {/* Dropzone */}
      {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor wires to the hidden input via id */}
      <label
        htmlFor="attachment-dropzone-input"
        className={cn(
          'flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-border-subtle px-3.5 py-2.5 transition-colors',
          dragOver && 'border-accent-primary bg-accent-primary/5',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={testId ? `${testId}-drop` : undefined}
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        <span className="text-sm text-text-primary">{COPY.dropHint}</span>
        <span className="flex-1" />
        <span className="text-xs text-text-muted">{COPY.footer}</span>
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
        <ul className="mt-2 flex flex-col gap-1.5" data-testid={testId ? `${testId}-rows` : undefined}>
          {rows.map((row) => (
            <AttachmentRow key={row.rowId} row={row} onRemove={() => removeRow(row.rowId)} />
          ))}
        </ul>
      )}
    </Card>
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

  // Remove button hidden while uploading (per spec — block remove until terminal).
  const showRemove = row.state.kind !== 'uploading';

  return (
    <li
      className="flex items-center gap-2.5 rounded-md bg-surface-card px-2.5 py-2"
      data-testid="attachment-row"
      data-state={row.state.kind}
      data-error-code={row.state.kind === 'error' ? row.state.code : undefined}
    >
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
