# cross-system

Cross-system commands/adapters shared by VOC/Findings/Tasks; must not import feature internals.

- Everything under this directory is neutral shared surface: it may import `@/lib/*`, `@fops/*`, and its own files only.
- Feature directories (`@/features/voc`, `@/features/integration`, `@/features/admin`, `@/features/tasks`) must never be imported from here.
- Consumers in any feature may import from `@/features/cross-system/*` without creating a feature-to-feature edge.
- Progress notes (`progress-notes/`) are the shared Finding/Task timeline. `ProgressNotesResource` is `{ kind: 'finding' | 'task'; id }` only. Contract: `docs/adr/0049-finding-task-progress-notes.md`.

## Key files

- `apps/frontend/src/features/cross-system/progress-notes/ProgressNotesSection.tsx` — shared Finding and Task timeline.
- `apps/frontend/src/features/cross-system/progress-notes/ProgressNotesComposer.tsx` — shared timeline composer.
- `apps/frontend/src/features/cross-system/progress-notes/ProgressNoteEntry.tsx` — single timeline entry.
- `apps/frontend/src/features/cross-system/progress-notes/useProgressNotes.ts` — progress-note list and create hooks.
- `apps/frontend/src/features/cross-system/mentions/MentionPickerButton.tsx` — @mention picker UI.
- `apps/frontend/src/features/cross-system/mentions/extractMentions.ts` — extracts actor ids from editor mentions.
- `apps/frontend/src/features/cross-system/mentions/insertMention.ts` — inserts a mention into the editor.
- `apps/frontend/src/features/cross-system/create-finding/CreateFindingModal.tsx` — shared VOC-to-Finding form.
- `apps/frontend/src/features/cross-system/create-finding/useCreateFindingFromVocMutation.ts` — VOC-originated Finding command hook.
