// Both attachment dropzones expose a focusable native picker button (U1-2, #1182): reachable by
// Tab, named by the visible copy, opens the file input on Enter/Space, and the hidden input
// stays out of the tab order.

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentDropzone } from './create/AttachmentDropzone';
import { ComposerAttachmentDropzone } from './detail/ComposerAttachmentDropzone';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const DROPZONES = [
  ['AttachmentDropzone', () => <AttachmentDropzone testId="create-dz" />, 'create-dz'],
  [
    'ComposerAttachmentDropzone',
    () => <ComposerAttachmentDropzone testId="composer-dz" />,
    'composer-dz',
  ],
] as const;

describe('attachment picker keyboard access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(
    DROPZONES.flatMap(
      ([name, ui, id]) =>
        [
          [name, ui, id, '{Enter}'],
          [name, ui, id, ' '],
        ] as const,
    ),
  )('%s: Tab reaches the named picker and %j opens the file input', async (_n, ui, id, key) => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(ui());

    const picker = screen.getByRole('button', { name: /파일을 드래그하거나 클릭해서 추가/ });
    // The create dropzone's label tip button comes first in the tab order.
    for (let i = 0; i < 3 && document.activeElement !== picker; i += 1) await user.tab();
    expect(picker).toHaveFocus();

    const input = screen.getByTestId(`${id}-input`) as HTMLInputElement;
    expect(input.tabIndex).toBe(-1);

    await user.keyboard(key);
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toBe(input);
  });

  it.each(DROPZONES)(
    '%s: a file chosen through the input is added as before',
    async (_n, ui, id) => {
      render(ui());
      const input = screen.getByTestId(`${id}-input`);
      const file = new File(['x'], 'shot.png', { type: 'image/png' });
      fireEvent.change(input, { target: { files: [file] } });
      expect(await screen.findByText('shot.png')).toBeInTheDocument();
    },
  );
});
