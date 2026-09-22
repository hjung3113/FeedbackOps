# cross-system

Cross-system commands/adapters shared by VOC/Findings/Tasks; must not import feature internals.

- Everything under this directory is neutral shared surface: it may import `@/lib/*`, `@fops/*`, and its own files only.
- Feature directories (`@/features/voc`, `@/features/integration`, `@/features/admin`, `@/features/tasks`) must never be imported from here.
- Consumers in any feature may import from `@/features/cross-system/*` without creating a feature-to-feature edge.
