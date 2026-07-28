import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseError } from 'pg';
import { z } from 'zod';

import {
  listTaskRequestsQuerySchema,
  listTasksQuerySchema,
  listVocsQuerySchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { savedViews } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import type { ActorContext } from '../permissions/check-service.js';
import { listFindingsQuerySchema } from '../findings/routes.js';

export const savedViewSurfaceSchema = z.enum(['voc', 'tasks', 'task_requests', 'findings']);
export type SavedViewSurface = z.infer<typeof savedViewSurfaceSchema>;

// Keep this next to the persisted-view boundary rather than accepting an
// untyped JSON object. Every entry is the actual list endpoint schema; adding
// a surface requires deliberately choosing its list contract.
const filterSchemaBySurface: Record<SavedViewSurface, z.ZodTypeAny> = {
  voc: listVocsQuerySchema,
  tasks: listTasksQuerySchema,
  task_requests: listTaskRequestsQuerySchema,
  findings: listFindingsQuerySchema,
};

export interface SavedViewDto {
  id: string;
  surface: SavedViewSurface;
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSavedViewInput {
  surface: SavedViewSurface;
  name: string;
  filter: Record<string, unknown>;
}

export interface UpdateSavedViewInput {
  name?: string;
  filter?: Record<string, unknown>;
}

function validateFilter(surface: SavedViewSurface, filter: unknown): Record<string, unknown> {
  if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) {
    throw new HttpError('validation.failed', 'saved view filter must be an object');
  }
  const parsed = filterSchemaBySurface[surface].safeParse(filter);
  if (!parsed.success) {
    throw new HttpError('validation.failed', 'saved view filter is not valid for its surface');
  }
  // Preserve validated wire input, rather than Zod's transformed output. VOC
  // comma-list filters intentionally transform strings to arrays for query
  // execution; storing that output would fail the same list schema on read.
  return filter as Record<string, unknown>;
}

function toDto(row: typeof savedViews.$inferSelect): SavedViewDto {
  const surface = savedViewSurfaceSchema.parse(row.surface);
  return {
    id: row.id,
    surface,
    name: row.name,
    // Stored payload is always rechecked. A stale/manual DB value therefore
    // rejects this read with 422 instead of becoming an omitted/unfiltered list.
    filter: validateFilter(surface, row.filterPayload),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function createSavedViewsService({ db }: { db: Db }) {
  const ownWhere = (actor: ActorContext, id?: string) => and(
    eq(savedViews.workspaceId, actor.workspace_id),
    eq(savedViews.actorId, actor.actor_id),
    ...(id === undefined ? [] : [eq(savedViews.id, id)]),
  );

  async function getOwnedRow(actor: ActorContext, id: string) {
    const row = await db.select().from(savedViews).where(ownWhere(actor, id)).limit(1);
    if (!row[0]) throw new HttpError('not_found.record', 'saved view not found');
    return row[0];
  }

  return {
    async list(actor: ActorContext, surface?: SavedViewSurface): Promise<{ items: SavedViewDto[] }> {
      const where = surface === undefined
        ? ownWhere(actor)
        : and(ownWhere(actor), eq(savedViews.surface, surface));
      const rows = await db.select().from(savedViews).where(where).orderBy(asc(savedViews.name));
      return { items: rows.map(toDto) };
    },

    async get(actor: ActorContext, id: string): Promise<SavedViewDto> {
      return toDto(await getOwnedRow(actor, id));
    },

    async create(actor: ActorContext, input: CreateSavedViewInput): Promise<SavedViewDto> {
      const name = input.name.trim();
      if (name.length === 0) throw new HttpError('validation.failed', 'saved view name is required');
      const filter = validateFilter(input.surface, input.filter);
      try {
        const rows = await db.insert(savedViews).values({
          workspaceId: actor.workspace_id,
          actorId: actor.actor_id,
          surface: input.surface,
          name,
          filterPayload: filter,
        }).returning();
        if (!rows[0]) throw new HttpError('internal.unexpected', 'saved view insert returned no row');
        return toDto(rows[0]);
      } catch (error) {
        if ((error as DatabaseError).code === '23505') {
          throw new HttpError('conflict.saved_view_name_taken', 'saved view name already exists');
        }
        throw error;
      }
    },

    async update(actor: ActorContext, id: string, input: UpdateSavedViewInput): Promise<SavedViewDto> {
      const current = await getOwnedRow(actor, id);
      const name = input.name === undefined ? current.name : input.name.trim();
      if (name.length === 0) throw new HttpError('validation.failed', 'saved view name is required');
      const filter = input.filter === undefined
        ? validateFilter(savedViewSurfaceSchema.parse(current.surface), current.filterPayload)
        : validateFilter(savedViewSurfaceSchema.parse(current.surface), input.filter);
      try {
        const rows = await db.update(savedViews).set({ name, filterPayload: filter, updatedAt: new Date() })
          .where(ownWhere(actor, id)).returning();
        if (!rows[0]) throw new HttpError('not_found.record', 'saved view not found');
        return toDto(rows[0]);
      } catch (error) {
        if ((error as DatabaseError).code === '23505') {
          throw new HttpError('conflict.saved_view_name_taken', 'saved view name already exists');
        }
        throw error;
      }
    },

    async remove(actor: ActorContext, id: string): Promise<void> {
      const rows = await db.delete(savedViews).where(ownWhere(actor, id)).returning({ id: savedViews.id });
      if (!rows[0]) throw new HttpError('not_found.record', 'saved view not found');
    },
  };
}

export type SavedViewsService = ReturnType<typeof createSavedViewsService>;
