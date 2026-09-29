import * as React from 'react';
import { toast } from 'sonner';

import { uploadAttachment } from '@/lib/api/attachments';
import { errorMapper } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import type { ApiError } from '@/lib/api/types';

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

const COPY = {
  oversize: '첨부 파일 크기가 허용 한도를 초과했습니다.',
  unsupportedType: '허용되지 않는 파일 형식입니다.',
} as const;

export type AttachmentUploadQueueRowState =
  | { kind: 'uploading' }
  | { kind: 'uploaded'; serverId: string }
  | { kind: 'error'; code: string; message: string };

export interface AttachmentUploadQueueRow {
  rowId: string;
  file: File;
  idempotencyKey: string;
  state: AttachmentUploadQueueRowState;
  abort: AbortController;
}

export interface UseAttachmentUploadQueueOptions {
  onChange?: (serverAttachmentIds: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onErrorCountChange?: (errorCount: number) => void;
  resetToken?: number;
}

function mintRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `row-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function clientSideRejection(file: File): { code: string; message: string } | null {
  if (file.size > MAX_SIZE_BYTES) {
    return { code: 'attachment.too_large', message: COPY.oversize };
  }
  return null;
}

export function useAttachmentUploadQueue({
  onChange,
  onUploadingChange,
  onErrorCountChange,
  resetToken,
}: UseAttachmentUploadQueueOptions = {}) {
  const [rows, setRows] = React.useState<AttachmentUploadQueueRow[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const uploadedIds = React.useMemo(
    () =>
      rows
        .filter(
          (row): row is AttachmentUploadQueueRow & {
            state: { kind: 'uploaded'; serverId: string };
          } => row.state.kind === 'uploaded',
        )
        .map((row) => row.state.serverId),
    [rows],
  );
  const anyUploading = rows.some((row) => row.state.kind === 'uploading');
  const errorCount = rows.filter((row) => row.state.kind === 'error').length;

  const lastUploadedRef = React.useRef<string>('');
  const lastUploadingRef = React.useRef<boolean | null>(null);
  const lastErrorCountRef = React.useRef<number | null>(null);

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

  React.useEffect(() => {
    if (resetToken === undefined) return;
    setRows((current) =>
      current.some((row) => row.state.kind === 'uploaded')
        ? current.filter((row) => row.state.kind !== 'uploaded')
        : current,
    );
  }, [resetToken]);

  const addFiles = React.useCallback((fileList: FileList | File[] | null): void => {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newRows: AttachmentUploadQueueRow[] = files.map((file) => {
      const rejection = clientSideRejection(file);
      const rowId = mintRowId();
      const idempotencyKey = mintIdempotencyKey();
      const abort = new AbortController();
      if (rejection) {
        return {
          rowId,
          file,
          idempotencyKey,
          abort,
          state: { kind: 'error', code: rejection.code, message: rejection.message },
        };
      }
      return { rowId, file, idempotencyKey, abort, state: { kind: 'uploading' } };
    });

    setRows((current) => [...current, ...newRows]);

    for (const row of newRows) {
      if (row.state.kind !== 'uploading') continue;
      void (async () => {
        try {
          const result = await uploadAttachment(row.file, {
            idempotencyKey: row.idempotencyKey,
            signal: row.abort.signal,
          });
          setRows((current) =>
            current.map((currentRow) =>
              currentRow.rowId === row.rowId
                ? { ...currentRow, state: { kind: 'uploaded', serverId: result.id } }
                : currentRow,
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
          setRows((current) =>
            current.map((currentRow) =>
              currentRow.rowId === row.rowId
                ? {
                    ...currentRow,
                    state: {
                      kind: 'error',
                      code: apiErr.code ?? 'internal.unexpected',
                      message: inlineMessage,
                    },
                  }
                : currentRow,
            ),
          );
        }
      })();
    }
  }, []);

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(): void {
    setDragOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer?.files ?? null);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    addFiles(event.target.files);
    event.target.value = '';
  }

  function removeRow(rowId: string): void {
    setRows((current) => {
      const row = current.find((currentRow) => currentRow.rowId === rowId);
      if (row && row.state.kind === 'uploading') row.abort.abort();
      return current.filter((currentRow) => currentRow.rowId !== rowId);
    });
  }

  return {
    rows,
    dragOver,
    inputRef,
    addFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleInputChange,
    removeRow,
  };
}
