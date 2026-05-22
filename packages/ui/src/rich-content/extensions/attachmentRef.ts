import { Node, mergeAttributes } from '@tiptap/core';

export interface AttachmentRefAttrs {
  id: string;
  /** Display name as returned by POST /attachments (PLAN-22 C8). */
  name?: string | null;
  /** Size in bytes from the upload envelope (PLAN-22 C8). */
  size_bytes?: number | null;
  /** MIME type from the upload envelope (PLAN-22 C8). */
  mime_type?: string | null;
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
      size_bytes: { default: null },
      mime_type: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="attachment-ref"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const id = HTMLAttributes.id ?? '';
    const name = HTMLAttributes.name ?? '';
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'attachment-ref',
          'data-attachment-id': id,
          'data-attachment-name': name,
          'data-attachment-size': HTMLAttributes.size_bytes ?? '',
          'data-attachment-mime': HTMLAttributes.mime_type ?? '',
        },
        HTMLAttributes,
      ),
      ['span', { class: 'attachment-icon' }, '📎'],
      ['span', { class: 'attachment-id' }, name || id || 'attachment'],
    ];
  },
});
