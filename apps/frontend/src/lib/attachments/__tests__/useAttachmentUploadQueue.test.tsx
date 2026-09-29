import { act, renderHook, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as attachmentsApi from '@/lib/api/attachments';
import { useAttachmentUploadQueue } from '../useAttachmentUploadQueue';

type UploadedAttachment = Awaited<ReturnType<typeof attachmentsApi.uploadAttachment>>;

const ATTACHMENT: UploadedAttachment = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'shot.png',
  size_bytes: 1024,
  mime_type: 'image/png',
  uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
  created_at: '2026-05-22T10:00:00.000Z',
};

function makeFile(): File {
  return new File(['image'], 'shot.png', { type: 'image/png' });
}

describe('useAttachmentUploadQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles drag-over and drop, then emits the uploaded attachment id', async () => {
    const uploadSpy = vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const onChange = vi.fn();
    const { result } = renderHook(() => useAttachmentUploadQueue({ onChange }));
    const file = makeFile();
    const preventDefault = vi.fn();
    const event = {
      preventDefault,
      dataTransfer: { files: [file] },
    } as unknown as React.DragEvent<HTMLLabelElement>;

    act(() => result.current.handleDragOver(event));
    expect(result.current.dragOver).toBe(true);

    act(() => result.current.handleDrop(event));

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(result.current.dragOver).toBe(false);
    await waitFor(() => {
      expect(result.current.rows[0]?.state).toEqual({
        kind: 'uploaded',
        serverId: ATTACHMENT.id,
      });
    });
    expect(uploadSpy).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    );
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([ATTACHMENT.id]));
  });

  it('clears the file input after adding the selected file', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const { result } = renderHook(() => useAttachmentUploadQueue());
    const input = { files: [makeFile()], value: 'C:\\fakepath\\shot.png' };

    act(() =>
      result.current.handleInputChange({
        target: input,
      } as unknown as React.ChangeEvent<HTMLInputElement>),
    );

    expect(input.value).toBe('');
    await waitFor(() => expect(result.current.rows[0]?.state.kind).toBe('uploaded'));
  });

  it('aborts an in-flight upload when its row is removed', async () => {
    let resolveUpload!: (attachment: UploadedAttachment) => void;
    const uploadSpy = vi.spyOn(attachmentsApi, 'uploadAttachment').mockReturnValue(
      new Promise<UploadedAttachment>((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const { result } = renderHook(() => useAttachmentUploadQueue());

    act(() => result.current.addFiles([makeFile()]));

    const row = result.current.rows[0];
    if (!row) throw new Error('expected the selected file to create an upload row');
    const signal = uploadSpy.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);

    act(() => result.current.removeRow(row.rowId));

    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveUpload(ATTACHMENT);
      await Promise.resolve();
    });
    expect(result.current.rows).toHaveLength(0);
  });
});
