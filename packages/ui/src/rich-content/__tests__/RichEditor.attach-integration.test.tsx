// RichEditor.attach-integration.test.tsx — PLAN-22 C8.
//
// Integration: file pick → onAttach(file) → AttachmentRef node inserted at
// cursor with {attachment_id, name, size_bytes, mime_type}. Failure path
// does NOT insert a node and re-throws so caller can toast.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AttachButton,
  RichEditor,
  type RichEditorAttachmentResult,
  type RichEditorSurface,
  type RichEditorToolbarApi,
} from '../../index';

const SURFACES: readonly RichEditorSurface[] = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
];

function readEditorJSON(): Record<string, unknown> {
  // TipTap exposes JSON via a global it sets after init; we read via the DOM
  // attachmentRef serialization which renderHTML stamps with data-attribute.
  const node = document.querySelector('[data-type="attachment-ref"]') as HTMLElement | null;
  if (!node) return { found: false };
  return {
    found: true,
    id: node.getAttribute('data-attachment-id'),
    name: node.getAttribute('data-attachment-name'),
    size: node.getAttribute('data-attachment-size'),
    mime: node.getAttribute('data-attachment-mime'),
  };
}

function pickFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

function renderEditor(opts: {
  surface: RichEditorSurface;
  onAttach?: (file: File) => Promise<RichEditorAttachmentResult>;
  onErrorRef?: { current?: unknown };
}) {
  const attachProp = opts.onAttach ? { onAttach: opts.onAttach } : {};
  return render(
    <RichEditor
      surface={opts.surface}
      {...attachProp}
      toolbar={(_editor, api: RichEditorToolbarApi) => (
        <AttachButton
          data-testid="rich-attach"
          onPick={async (file) => {
            try {
              await api.attach(file);
            } catch (e) {
              if (opts.onErrorRef) opts.onErrorRef.current = e;
            }
          }}
        />
      )}
    />,
  );
}

describe('RichEditor + AttachButton integration', () => {
  it('inserts an AttachmentRef node at cursor with the full upload envelope on success', async () => {
    const result: RichEditorAttachmentResult = {
      attachment_id: '11111111-1111-1111-1111-111111111111',
      name: 'shot.png',
      size_bytes: 4096,
      mime_type: 'image/png',
    };
    const onAttach = vi.fn().mockResolvedValue(result);
    renderEditor({ surface: 'voc-description', onAttach });

    const file = new File(['bin'], 'shot.png', { type: 'image/png' });
    pickFile(screen.getByTestId('rich-attach-input') as HTMLInputElement, file);

    await waitFor(() => expect(onAttach).toHaveBeenCalledWith(file));
    await waitFor(() => {
      const node = readEditorJSON();
      expect(node).toMatchObject({
        found: true,
        id: result.attachment_id,
        name: result.name,
        size: String(result.size_bytes),
        mime: result.mime_type,
      });
    });
  });

  it('does NOT insert a node when onAttach rejects, and the error is observable to the caller', async () => {
    const onAttach = vi.fn().mockRejectedValue(new Error('attachment.too_large'));
    const errorRef: { current?: unknown } = {};
    renderEditor({ surface: 'reporter-reply', onAttach, onErrorRef: errorRef });

    const file = new File(['x'], 'huge.bin', { type: 'application/octet-stream' });
    pickFile(screen.getByTestId('rich-attach-input') as HTMLInputElement, file);

    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    await waitFor(() => {
      expect(errorRef.current).toBeInstanceOf(Error);
      expect((errorRef.current as Error).message).toBe('attachment.too_large');
    });
    expect(readEditorJSON()).toEqual({ found: false });
  });

  it.each(SURFACES)('renders AttachButton in surface=%s when toolbar wires it', (surface) => {
    const onAttach = vi.fn().mockResolvedValue({
      attachment_id: 'id',
      name: 'n',
      size_bytes: 1,
      mime_type: 'text/plain',
    });
    renderEditor({ surface, onAttach });
    expect(screen.getByRole('button', { name: '첨부 파일 추가' })).toBeInTheDocument();
  });

  it('toolbarApi.attach rejects when onAttach is not configured', async () => {
    const errorRef: { current?: unknown } = {};
    renderEditor({ surface: 'internal-comment', onErrorRef: errorRef });
    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    pickFile(screen.getByTestId('rich-attach-input') as HTMLInputElement, file);
    await waitFor(() => {
      expect(errorRef.current).toBeInstanceOf(Error);
    });
    expect(readEditorJSON()).toEqual({ found: false });
  });
});
