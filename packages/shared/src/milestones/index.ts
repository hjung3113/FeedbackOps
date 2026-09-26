// #514 A3 — shared Milestone schemas.
// DTO field names are the milestone column names; timestamps are ISO strings.
// `progress` lands with B1c, `source_finding` with A9. No max length is
// imposed on title/why (design §7 item 7 leaves limits unspecified).

import { z } from 'zod';

// Same parser shape as the tasks module's private isoDateSchema.
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
  })
  .strict();
export type MilestoneDto = z.infer<typeof milestoneDtoSchema>;
