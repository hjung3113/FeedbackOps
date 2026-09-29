import type { TipTapEditor } from '@fops/ui';

export interface MentionActor {
  id: string;
  display_name: string;
}

export function insertMention(editor: TipTapEditor | null, actor: MentionActor): void {
  editor
    ?.chain()
    .focus()
    .insertContent({
      type: 'mention',
      attrs: { actor_id: actor.id },
    })
    .run();
}
