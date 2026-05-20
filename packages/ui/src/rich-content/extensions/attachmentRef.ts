import { Node, mergeAttributes } from '@tiptap/core';

export interface AttachmentRefAttrs {
  id: string;
}

export const AttachmentRef = Node.create({
  name: 'attachmentRef',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="attachment-ref"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'attachment-ref' }, HTMLAttributes),
      // Display name/size/mime come from a runtime registry (passed via context in #19+).
      // Without context, render id-only placeholder.
      ['span', { class: 'attachment-icon' }, '📎'],
      ['span', { class: 'attachment-id', 'data-attachment-id': HTMLAttributes.id ?? '' }, HTMLAttributes.id ?? 'attachment'],
    ];
  },
});
