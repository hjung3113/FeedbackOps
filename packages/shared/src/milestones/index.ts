// #514 A3 — shared Milestone schemas.
// DTO field names are the milestone column names; timestamps are ISO strings.
// `progress` (B1c) sits on both the list DTO and the detail DTO.
import { z } from 'zod';

import { isoDateSchema } from '../tasks/index.js';

// #514 B1c — child-Task progress buckets: released_done = done + released
// (B1 formula); in_flight = doing + review + reopened (counting reopened as
// in flight is the design §7 item 4 proposal); queued = backlog + todo;
// total = child count; percent = total === 0 ? 0 : round(100*released_done/total).
export const milestoneProgressSchema = z
  .object({
    released_done: z.number().int().nonnegative(),
    in_flight: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    percent: z.number().int().min(0).max(100),
  })
  .strict();
export type MilestoneProgress = z.infer<typeof milestoneProgressSchema>;

export const milestoneStatusFilterSchema = z.enum([
  'planning',
  'in_progress',
  'blocked',
  'released',
]);
export type MilestoneStatusFilter = z.infer<typeof milestoneStatusFilterSchema>;

const milestoneTextField = z.string().trim().min(1);

export const createMilestoneRequestSchema = z
  .object({
    title: milestoneTextField,
    why: milestoneTextField,
    primary_managed_system_id: z.string().uuid(),
    owner_actor_id: z.string().uuid().optional(),
    analytics_area_id: z.string().uuid().nullable().optional(),
    start_date: isoDateSchema,
    target_date: isoDateSchema,
  })
  .strict();
export type CreateMilestoneRequest = z.infer<typeof createMilestoneRequestSchema>;

// primary_managed_system_id and status are not PATCH fields. Status waits for
// the G-status ADR (A-status amends this schema).
export const patchMilestoneRequestSchema = z
  .object({
    title: milestoneTextField.optional(),
    why: milestoneTextField.optional(),
    owner_actor_id: z.string().uuid().optional(),
    analytics_area_id: z.string().uuid().nullable().optional(),
    start_date: isoDateSchema.optional(),
    target_date: isoDateSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message:
      'at least one of title, why, owner_actor_id, analytics_area_id, start_date, target_date is required',
  });
export type PatchMilestoneRequest = z.infer<typeof patchMilestoneRequestSchema>;

export const listMilestonesQuerySchema = z
  .object({
    managed_system_id: z.union([z.string().uuid(), z.literal('all')]).optional(),
    status: milestoneStatusFilterSchema.optional(),
  })
  .strict();
export type ListMilestonesQuery = z.infer<typeof listMilestonesQuerySchema>;

// status is a plain string: the persisted set is the open G-status decision.
export const milestoneDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    display_id: z.string(),
    primary_managed_system_id: z.string().uuid(),
    title: z.string(),
    why: z.string(),
    status: z.string(),
    owner_actor_id: z.string().uuid(),
    analytics_area_id: z.string().uuid().nullable(),
    start_date: isoDateSchema,
    target_date: isoDateSchema,
    created_by: z.string().uuid(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    progress: milestoneProgressSchema,
  })
  .strict();
export type MilestoneDto = z.infer<typeof milestoneDtoSchema>;

export const milestoneSourceFindingSchema = z
  .object({
    id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    summary: z.string(),
    evidence_count: z.number().int().nonnegative(),
  })
  .strict();
export type MilestoneSourceFinding = z.infer<typeof milestoneSourceFindingSchema>;

// Detail-only extension of MilestoneDto (list stays without source_finding).
export const milestoneDetailDtoSchema = milestoneDtoSchema.extend({
  source_finding: milestoneSourceFindingSchema.nullable(),
});
export type MilestoneDetailDto = z.infer<typeof milestoneDetailDtoSchema>;
