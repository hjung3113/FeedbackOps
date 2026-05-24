import type { Editor } from '@tiptap/react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichEditor, type RichEditorSurface, type TipTapDoc } from '../RichEditor';

const ATTACHMENT_UUID = '22222222-2222-2222-2222-222222222222';
const ACTOR_UUID = '11111111-1111-1111-1111-111111111111';

function renderWithEditor(surface: RichEditorSurface) {
  let editorRef: Editor | null = null;
  let latestDoc: TipTapDoc | null = null;
  render(
    <RichEditor
      surface={surface}
      onChange={(doc) => {
        latestDoc = doc;
      }}
      toolbar={(editor) => {
        editorRef = editor;
        return null;
      }}
    />,
  );

  return {
    async editor() {
      await waitFor(() => expect(editorRef).not.toBeNull());
      return editorRef!;
    },
    async doc() {
      await waitFor(() => expect(latestDoc).not.toBeNull());
      return latestDoc!;
    },
  };
}

function flattenTypes(doc: TipTapDoc): string {
  const types: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const current = node as { type?: unknown; marks?: unknown; content?: unknown };
    if (typeof current.type === 'string') types.push(current.type);
    if (Array.isArray(current.marks)) {
      for (const mark of current.marks) visit(mark);
    }
    if (Array.isArray(current.content)) {
      for (const child of current.content) visit(child);
    }
  };
  visit(doc);
  return types.join(' ');
}

describe('RichEditor surface extension registration', () => {
  it('public-update strips pasted link marks and rejects disallowed mention and attachment nodes', async () => {
    const harness = renderWithEditor('public-update');
    const editor = await harness.editor();

    editor
      .chain()
      .insertContent('<p><a href="https://example.com">linked</a></p>')
      .insertContent(`<p><span data-type="mention" actor_id="${ACTOR_UUID}">@actor</span></p>`)
      .insertContent(
        `<div data-type="attachment-ref" id="${ATTACHMENT_UUID}" data-attachment-id="${ATTACHMENT_UUID}"></div>`,
      )
      .run();

    const doc = await harness.doc();
    const flat = JSON.stringify(doc);
    expect(flat).toContain('linked');
    expect(flattenTypes(doc)).not.toContain('link');
    expect(flattenTypes(doc)).not.toContain('mention');
    expect(flattenTypes(doc)).not.toContain('attachmentRef');
  });

  it('voc-description keeps allowed pasted link, underline, and attachmentRef content', async () => {
    const harness = renderWithEditor('voc-description');
    const editor = await harness.editor();

    editor
      .chain()
      .insertContent('<p><a href="https://example.com"><u>linked</u></a></p>')
      .insertContent({ type: 'attachmentRef', attrs: { id: ATTACHMENT_UUID } })
      .run();

    const doc = await harness.doc();
    const flatTypes = flattenTypes(doc);
    expect(flatTypes).toContain('link');
    expect(flatTypes).toContain('underline');
    expect(flatTypes).toContain('attachmentRef');
  });

  it('internal-comment keeps allowed pasted link, mention, and attachmentRef content', async () => {
    const harness = renderWithEditor('internal-comment');
    const editor = await harness.editor();

    editor
      .chain()
      .insertContent('<p><a href="https://example.com">linked</a></p>')
      .insertContent({ type: 'mention', attrs: { actor_id: ACTOR_UUID } })
      .insertContent({ type: 'attachmentRef', attrs: { id: ATTACHMENT_UUID } })
      .run();

    const doc = await harness.doc();
    const flatTypes = flattenTypes(doc);
    expect(flatTypes).toContain('link');
    expect(flatTypes).toContain('mention');
    expect(flatTypes).toContain('attachmentRef');
  });
});
