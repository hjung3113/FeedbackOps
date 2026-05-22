// GET /actors?workspace=current — response schema.
//
// Returns the caller's workspace actors for use as assignee candidates
// (Triage OwnerPicker, future Task assignment UIs). The `workspace` query
// param is a pinned sentinel for now: the BE always resolves "the session's
// workspace" and rejects any other value. This keeps the URL self-describing
// without enabling cross-workspace reads.
//
// Shape: snake_case fields per project convention (matches /me and POST
// /auth/mock-login payloads in apps/backend/src/modules/auth/routes.ts).
// `role_level` reuses the canonical ROLE_LEVEL_VALUES enum.

import { z } from 'zod';

import { ROLE_LEVEL_VALUES } from '../enums/index.js';

export const actorListItemSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  email: z.string().min(1),
  role_level: z.enum(ROLE_LEVEL_VALUES),
});
export type ActorListItem = z.infer<typeof actorListItemSchema>;

export const listActorsResponseSchema = z.object({
  actors: z.array(actorListItemSchema),
});
export type ListActorsResponse = z.infer<typeof listActorsResponseSchema>;
