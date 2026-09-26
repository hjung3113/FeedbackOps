// Milestone audit detail schemas (#514 A3).
// `milestone_created` records a create; `milestone_updated` records a field
// update. `from_status` / `to_status` stay optional so A-status can populate
// them once the G-status ADR lands. Imported by audit-events.ts to register
// into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const MILESTONE_AUDIT_EVENT_TYPES = ['milestone_created', 'milestone_updated'] as const;

export const milestoneCreatedDetailSchema = z
  .object({
    milestone_id: z.string().uuid(),
    display_id: z.string(),
    primary_managed_system_id: z.string().uuid(),
  })
  .strict();
export type MilestoneCreatedDetail = z.infer<typeof milestoneCreatedDetailSchema>;

export const milestoneUpdatedDetailSchema = z
  .object({
    milestone_id: z.string().uuid(),
    fields: z.array(
      z.enum(['title', 'why', 'owner_actor_id', 'analytics_area_id', 'start_date', 'target_date']),
    ),
    from_status: z.string().optional(),
    to_status: z.string().optional(),
  })
  .strict();
export type MilestoneUpdatedDetail = z.infer<typeof milestoneUpdatedDetailSchema>;

export const MILESTONE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  milestone_created: milestoneCreatedDetailSchema,
  milestone_updated: milestoneUpdatedDetailSchema,
} as const satisfies Record<(typeof MILESTONE_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
