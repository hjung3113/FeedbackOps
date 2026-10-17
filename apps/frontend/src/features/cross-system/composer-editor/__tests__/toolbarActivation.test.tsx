// All four composer toolbars share one activation path: native click, so mouse, Enter and Space
// run the same command on the real editor and hand focus back to it (AF-2, #1182).

import { NotesToolbar } from '@/features/cross-system/progress-notes/ProgressNotesComposer';
import { InternalCommentToolbar } from '@/features/voc/components/detail/rich-toolbars/InternalCommentToolbar';
import { PublicUpdateToolbar } from '@/features/voc/components/detail/rich-toolbars/PublicUpdateToolbar';
import { ReporterReplyToolbar } from '@/features/voc/components/detail/rich-toolbars/ReporterReplyToolbar';
import { HELLO_WORLD_DOC, RealEditorHarness, useJsdomRangeGeometry } from '@/test/realEditor';
import type { RichEditorSurface, TipTapEditor } from '@fops/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

interface ToolbarCase {
  name: string;
  surface: RichEditorSurface;
  toolbar: (editor: TipTapEditor | null) => React.ReactNode;
}

const TOOLBARS: ToolbarCase[] = [
  {
    name: 'PublicUpdateToolbar',
    surface: 'public-update',
    toolbar: (editor) => <PublicUpdateToolbar editor={editor} />,
  },
  {
    name: 'ReporterReplyToolbar',
    surface: 'reporter-reply',
    toolbar: (editor) => <ReporterReplyToolbar editor={editor} />,
  },
  {
    name: 'InternalCommentToolbar',
    surface: 'internal-comment',
    toolbar: (editor) => <InternalCommentToolbar editor={editor} onInsertMention={() => {}} />,
  },
  {
    name: 'progress NotesToolbar',
    surface: 'internal-comment',
    toolbar: (editor) => <NotesToolbar editor={editor} />,
  },
];

type Activation = 'Enter' | 'Space' | 'mouse click';
const ACTIVATIONS: Activation[] = ['Enter', 'Space', 'mouse click'];

const CASES = TOOLBARS.flatMap((toolbar) =>
  ACTIVATIONS.map((activation) => [toolbar.name, activation, toolbar] as const),
);

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('composer toolbar activation (real TipTap editor)', () => {
  useJsdomRangeGeometry();

  it.each(CASES)(
    '%s: %s bolds only the selected text and refocuses the editor',
    async (_n, activation, toolbar) => {
      const user = userEvent.setup();
      let editor: TipTapEditor | null = null;
      render(
        <RealEditorHarness
          surface={toolbar.surface}
          value={HELLO_WORLD_DOC}
          onEditor={(e) => {
            editor = e;
          }}
          renderToolbar={toolbar.toolbar}
        />,
      );
      await waitFor(() => expect(editor).not.toBeNull());
      const live = editor as unknown as TipTapEditor;
      // "hello" is positions 1..6 of "hello world" (paragraph opens at 0).
      live.commands.setTextSelection({ from: 1, to: 6 });

      const bold = screen.getByRole('button', { name: '굵게' });
      if (activation === 'mouse click') {
        await user.click(bold);
      } else if (activation === 'Enter') {
        await user.tab();
        expect(bold).toHaveFocus();
        await user.keyboard('{Enter}');
      } else {
        // Reach the button backwards from the editor: Shift+Tab until it is focused.
        live.commands.focus();
        await nextFrame();
        for (let i = 0; i < 6 && document.activeElement !== bold; i += 1) {
          await user.tab({ shift: true });
        }
        expect(bold).toHaveFocus();
        await user.keyboard(' ');
      }

      await nextFrame();
      await waitFor(() => expect(live.view.dom).toHaveFocus());
      expect(live.state.selection.from).toBe(1);
      expect(live.state.selection.to).toBe(6);
      expect(live.getJSON().content?.[0]?.content).toEqual([
        { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' world' },
      ]);
    },
  );
});
