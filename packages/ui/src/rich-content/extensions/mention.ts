import { Node, mergeAttributes } from '@tiptap/core';

export interface MentionAttrs {
  actor_id: string;
  label: string;
}

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      actor_id: { default: null },
      label: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'mention', class: 'mention-chip' }, HTMLAttributes),
      `@${HTMLAttributes.label ?? 'mention'}`,
    ];
  },
});
