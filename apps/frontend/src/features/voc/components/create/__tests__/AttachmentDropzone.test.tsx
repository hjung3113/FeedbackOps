// AttachmentDropzone — active upload behavior tests (PLAN-22 C6).
//
// Covers per-row state machine, onChange emission, oversize / unsupported_type
// inline error copy, storage.unavailable toast, and parent disable-while-uploading.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { AttachmentDropzone } from '../AttachmentDropzone';
import * as attachmentsApi from '@/lib/api/attachments';
import { ApiError } from '@/lib/api/types';

const FAKE_ATTACHMENT = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'shot.png',
  size_bytes: 1024,
  mime_type: 'image/png',
  uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
  created_at: '2026-05-22T10:00:00.000Z',
};

function makeFile(name = 'shot.png', type = 'image/png', size = 1024): File {
  // node's File doesn't fill size from blob bytes reliably across vitest
  // versions — explicitly override via getter to lock the value the test cares about.
  const f = new File(['x'.repeat(Math.min(size, 1024))], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

function fireFilePick(container: HTMLElement, files: File[]): void {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  // Build a FileList-like object
  const dt = {
    files: Object.assign(files, {
      item: (i: number) => files[i] ?? null,
    }),
  };
  fireEvent.change(input, { target: dt });
}

describe('<AttachmentDropzone> (C6 active upload)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dropzone with verbatim prototype copy', () => {
    render(<AttachmentDropzone />);
    expect(screen.getByText('첨부')).toBeInTheDocument();
    expect(screen.getByText('파일을 드래그하거나 클릭해서 추가')).toBeInTheDocument();
    expect(screen.getByText('최대 25MB · 다중 선택')).toBeInTheDocument();
  });

  it('drop file → POST /attachments → row shows uploaded state and onChange emits server id', async () => {
    const spy = vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(FAKE_ATTACHMENT);
    const onChange = vi.fn();
    const { container } = render(<AttachmentDropzone onChange={onChange} testId="dz" />);

    await act(async () => {
      fireFilePick(container, [makeFile()]);
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    // Idempotency-Key was supplied per-file
    const [fileArg, optsArg] = spy.mock.calls[0]!;
    expect(fileArg.name).toBe('shot.png');
    expect(typeof optsArg?.idempotencyKey).toBe('string');
    expect(optsArg?.idempotencyKey?.length).toBeGreaterThan(8);

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });
    // onChange called with the server id once upload resolves
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith([FAKE_ATTACHMENT.id]);
    });
  });

  it('26MB file → row shows attachment.too_large copy and is NOT in attachment_ids[]', async () => {
    const spy = vi.spyOn(attachmentsApi, 'uploadAttachment');
    const onChange = vi.fn();
    const { container } = render(<AttachmentDropzone onChange={onChange} />);

    const oversize = makeFile('big.png', 'image/png', 26 * 1024 * 1024);
    await act(async () => {
      fireFilePick(container, [oversize]);
    });

    // Client-side rejection: upload should NOT have been called.
    expect(spy).not.toHaveBeenCalled();

    const row = await screen.findByTestId('attachment-row');
    expect(row.getAttribute('data-state')).toBe('error');
    expect(row.getAttribute('data-error-code')).toBe('attachment.too_large');
    expect(row.textContent).toContain('첨부 파일 크기가 허용 한도를 초과했습니다.');

    // onChange should never have been called with the failed id
    const lastCall = onChange.mock.calls.at(-1);
    if (lastCall) expect(lastCall[0]).toEqual([]);
  });

  it('unsupported type → row shows attachment.unsupported_type copy', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
    );
    const { container } = render(<AttachmentDropzone />);

    await act(async () => {
      fireFilePick(container, [makeFile('archive.zip', 'application/zip')]);
    });

    await waitFor(() => {
      const row = screen.getByTestId('attachment-row');
      expect(row.getAttribute('data-state')).toBe('error');
      expect(row.getAttribute('data-error-code')).toBe('attachment.unsupported_type');
    });
    expect(screen.getByTestId('attachment-row').textContent).toContain('허용되지 않는 파일 형식입니다.');
  });

  it('storage failure → toast.error with storage.unavailable Korean copy', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(502, { code: 'storage.unavailable', message: 'down' }),
    );
    const { container } = render(<AttachmentDropzone />);

    await act(async () => {
      fireFilePick(container, [makeFile()]);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        '파일 저장소에 접근할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      );
    });
  });

  it('PLAN-22 Bug-3: emits onErrorCountChange when a row enters error state', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
    );
    const onErrorCountChange = vi.fn();
    const { container } = render(
      <AttachmentDropzone onErrorCountChange={onErrorCountChange} />,
    );

    await act(async () => {
      fireFilePick(container, [makeFile('archive.zip', 'application/zip')]);
    });

    await waitFor(() => {
      expect(onErrorCountChange).toHaveBeenLastCalledWith(1);
    });
  });

  it('PLAN-22 Bug-3: onErrorCountChange returns to 0 when the error row is removed', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
    );
    const onErrorCountChange = vi.fn();
    const { container } = render(
      <AttachmentDropzone onErrorCountChange={onErrorCountChange} />,
    );

    await act(async () => {
      fireFilePick(container, [makeFile('archive.zip', 'application/zip')]);
    });

    await waitFor(() => {
      expect(onErrorCountChange).toHaveBeenLastCalledWith(1);
    });

    // Remove the error row → count back to 0.
    const removeBtn = await screen.findByLabelText('첨부 제거');
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    await waitFor(() => {
      expect(onErrorCountChange).toHaveBeenLastCalledWith(0);
    });
  });

  it('emits onUploadingChange(true) while in flight then (false) when settled', async () => {
    let resolveUpload!: (v: typeof FAKE_ATTACHMENT) => void;
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockReturnValue(
      new Promise((res) => {
        resolveUpload = res;
      }),
    );
    const onUploadingChange = vi.fn();
    const { container } = render(<AttachmentDropzone onUploadingChange={onUploadingChange} />);

    await act(async () => {
      fireFilePick(container, [makeFile()]);
    });

    await waitFor(() => {
      expect(onUploadingChange).toHaveBeenCalledWith(true);
    });

    await act(async () => {
      resolveUpload(FAKE_ATTACHMENT);
    });

    await waitFor(() => {
      expect(onUploadingChange).toHaveBeenLastCalledWith(false);
    });
  });
});
