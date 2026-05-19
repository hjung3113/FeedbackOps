import { Node, mergeAttributes } from '@tiptap/core';

export interface AttachmentRefAttrs {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
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
      name: { default: null },
      sizeBytes: {
        default: 0,
        renderHTML: (attrs) => ({ 'data-size-bytes': attrs.sizeBytes }),
        parseHTML: (el) => Number(el.getAttribute('data-size-bytes') ?? 0),
      },
      mimeType: { default: 'application/octet-stream' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="attachment-ref"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'attachment-ref' }, HTMLAttributes),
      ['span', { class: 'attachment-icon' }, '📎'],
      ['span', { class: 'attachment-name' }, HTMLAttributes.name ?? 'attachment'],
    ];
  },
});
