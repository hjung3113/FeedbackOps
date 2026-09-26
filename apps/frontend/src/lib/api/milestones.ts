// Milestone domain client (#514 B2b).
//
// Contract: docs/implementation/api/milestones.md
//   POST /milestones, GET /milestones, GET /milestones/:id, PATCH /milestones/:id
// apiRequest + shared zod parsers per apps/frontend/AGENTS.md — no unparsed calls.
// Create sends primary_managed_system_id and never managed_system_id; patch sends
// If-Match (the last seen updated_at) and no Managed System; neither sends status
// until B2e-status.

import {
  type CreateMilestoneRequest,
  type ListMilestonesQuery,
  type MilestoneDetailDto,
  type MilestoneDto,
  type PatchMilestoneRequest,
  milestoneDetailDtoSchema,
  milestoneDtoSchema,
} from '@fops/shared';
import { z } from 'zod';

import { apiRequest } from './client';

const listMilestonesResponseSchema = z.object({ items: z.array(milestoneDtoSchema) }).strict();
export type ListMilestonesResponse = z.infer<typeof listMilestonesResponseSchema>;

export async function listMilestones(
  options: ListMilestonesQuery & { signal?: AbortSignal } = {},
): Promise<ListMilestonesResponse> {
  const qs = new URLSearchParams();
  if (options.managed_system_id !== undefined) {
    qs.set('managed_system_id', options.managed_system_id);
  }
  if (options.status !== undefined) qs.set('status', options.status);
  const path = qs.size > 0 ? `/milestones?${qs.toString()}` : '/milestones';
  const res = await apiRequest('GET', path, listMilestonesResponseSchema, {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return res.data;
}

export async function getMilestone(id: string, signal?: AbortSignal): Promise<MilestoneDetailDto> {
  const res = await apiRequest('GET', `/milestones/${id}`, milestoneDetailDtoSchema, {
    ...(signal !== undefined ? { signal } : {}),
  });
  return res.data;
}

export async function createMilestone(
  body: CreateMilestoneRequest,
  idempotencyKey: string,
): Promise<MilestoneDto> {
  const res = await apiRequest('POST', '/milestones', milestoneDtoSchema, {
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function updateMilestone(
  id: string,
  body: PatchMilestoneRequest,
  options: { ifMatch: string; idempotencyKey: string },
): Promise<MilestoneDto> {
  const res = await apiRequest('PATCH', `/milestones/${id}`, milestoneDtoSchema, {
    body,
    ifMatch: options.ifMatch,
    idempotencyKey: options.idempotencyKey,
  });
  return res.data;
}
