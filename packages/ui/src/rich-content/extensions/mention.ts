import { Node, mergeAttributes } from '@tiptap/core';

export interface MentionAttrs {
  actor_id: string;
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
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'mention', class: 'mention-chip' }, HTMLAttributes),
      // Label comes from runtime user registry (passed via context in #19+).
      `@${HTMLAttributes.actor_id ?? 'mention'}`,
    ];
  },
});
