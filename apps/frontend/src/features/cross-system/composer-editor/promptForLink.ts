// promptForLink — the link button's prompt flow shared by the composer toolbars.
// Cancel keeps the link, an empty URL clears the whole link, anything else sets it.

import type { TipTapEditor } from '@fops/ui';

export function promptForLink(editor: TipTapEditor | null): void {
  if (!editor) return;
  const previousUrl = (editor.getAttributes('link').href as string | undefined) ?? '';
  const url = window.prompt('링크 URL', previousUrl);
  if (url === null) return;
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }
}
