// #514 A3 — shared Milestone request/query/DTO schemas and audit detail
// schemas. Locks the create-only Managed System rule at the schema layer and
// the no-max-length rule for title/why (design §7 item 7).

import { describe, expect, it } from 'vitest';

import {
  milestoneCreatedDetailSchema,
  milestoneUpdatedDetailSchema,
} from '../../audit/milestone.js';
import {
  createMilestoneRequestSchema,
  listMilestonesQuerySchema,
  patchMilestoneRequestSchema,
} from '../index.js';

const validCreate = {
  title: 'Payments reliability',
  why: 'Reporters keep hitting the same checkout failures',
  primary_managed_system_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1001',
  start_date: '2026-10-01',
  target_date: '2026-12-31',
};

describe('createMilestoneRequestSchema', () => {
  it('accepts the five required fields and defaults nothing else', () => {
    const parsed = createMilestoneRequestSchema.parse(validCreate);
    expect(parsed.owner_actor_id).toBeUndefined();
    expect(parsed.analytics_area_id).toBeUndefined();
  });

  it('accepts optional owner_actor_id and analytics_area_id', () => {
    const parsed = createMilestoneRequestSchema.parse({
      ...validCreate,
      owner_actor_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1002',
      analytics_area_id: null,
    });
    expect(parsed.analytics_area_id).toBeNull();
  });

  for (const field of [
    'title',
    'why',
    'primary_managed_system_id',
    'start_date',
    'target_date',
  ] as const) {
    it(`rejects a missing ${field}`, () => {
      const body = { ...validCreate } as Record<string, unknown>;
      delete body[field];
      expect(createMilestoneRequestSchema.safeParse(body).success).toBe(false);
    });
  }

  it('rejects managed_system_id (strict; the field is primary_managed_system_id)', () => {
    expect(
      createMilestoneRequestSchema.safeParse({
        ...validCreate,
        managed_system_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1003',
      }).success,
    ).toBe(false);
  });

  it('rejects status (strict; client status waits for the G-status ADR / A-status)', () => {
    expect(
      createMilestoneRequestSchema.safeParse({ ...validCreate, status: 'planning' }).success,
    ).toBe(false);
  });

  it('accepts title and why of length 201 — no max length is authorized', () => {
    const long = 'a'.repeat(201);
    expect(
      createMilestoneRequestSchema.safeParse({ ...validCreate, title: long, why: long }).success,
    ).toBe(true);
  });

  it('rejects empty or whitespace-only title and why', () => {
    expect(createMilestoneRequestSchema.safeParse({ ...validCreate, title: '' }).success).toBe(
      false,
    );
    expect(createMilestoneRequestSchema.safeParse({ ...validCreate, title: '   ' }).success).toBe(
      false,
    );
    expect(createMilestoneRequestSchema.safeParse({ ...validCreate, why: '' }).success).toBe(false);
    expect(createMilestoneRequestSchema.safeParse({ ...validCreate, why: ' \t ' }).success).toBe(
      false,
    );
  });

  it('trims title and why', () => {
    const parsed = createMilestoneRequestSchema.parse({ ...validCreate, title: '  x  ' });
    expect(parsed.title).toBe('x');
  });

  it('requires bare ISO date shapes (YYYY-MM-DD), like the tasks helper', () => {
    expect(
      createMilestoneRequestSchema.safeParse({ ...validCreate, start_date: '2026-10-1' }).success,
    ).toBe(false);
    expect(
      createMilestoneRequestSchema.safeParse({ ...validCreate, target_date: '2026/12/31' }).success,
    ).toBe(false);
  });
});

describe('patchMilestoneRequestSchema', () => {
  it('accepts a single updatable field', () => {
    expect(patchMilestoneRequestSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
    expect(
      patchMilestoneRequestSchema.safeParse({
        analytics_area_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1004',
      }).success,
    ).toBe(true);
    expect(patchMilestoneRequestSchema.safeParse({ analytics_area_id: null }).success).toBe(true);
  });

  it('rejects an empty body (at least one field required)', () => {
    expect(patchMilestoneRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects primary_managed_system_id under either name (requirement 2)', () => {
    expect(
      patchMilestoneRequestSchema.safeParse({
        primary_managed_system_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1005',
      }).success,
    ).toBe(false);
    expect(
      patchMilestoneRequestSchema.safeParse({
        managed_system_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1005',
      }).success,
    ).toBe(false);
  });

  it('rejects status until A-status applies the G-status ADR', () => {
    expect(patchMilestoneRequestSchema.safeParse({ status: 'released' }).success).toBe(false);
  });
});

describe('listMilestonesQuerySchema', () => {
  it('accepts uuid or all for managed_system_id, defaults absent', () => {
    expect(listMilestonesQuerySchema.parse({}).managed_system_id).toBeUndefined();
    expect(listMilestonesQuerySchema.parse({ managed_system_id: 'all' }).managed_system_id).toBe(
      'all',
    );
    expect(listMilestonesQuerySchema.safeParse({ managed_system_id: 'everything' }).success).toBe(
      false,
    );
  });

  it('limits status to the four prototype tab labels (filter, not a transition rule)', () => {
    for (const status of ['planning', 'in_progress', 'blocked', 'released']) {
      expect(listMilestonesQuerySchema.safeParse({ status }).success).toBe(true);
    }
    expect(listMilestonesQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('rejects q and unknown keys (strict)', () => {
    expect(listMilestonesQuerySchema.safeParse({ q: 'x' }).success).toBe(false);
    expect(listMilestonesQuerySchema.safeParse({ sort: 'title' }).success).toBe(false);
  });
});

describe('milestone audit detail schemas', () => {
  it('milestone_created validates a create detail', () => {
    expect(
      milestoneCreatedDetailSchema.safeParse({
        milestone_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1006',
        display_id: 'MLS-1000',
        primary_managed_system_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1001',
      }).success,
    ).toBe(true);
  });

  it('milestone_updated allows a field update with no status pair', () => {
    expect(
      milestoneUpdatedDetailSchema.safeParse({
        milestone_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1006',
        fields: ['title'],
      }).success,
    ).toBe(true);
  });

  it('milestone_updated keeps from_status / to_status optional for A-status', () => {
    const parsed = milestoneUpdatedDetailSchema.parse({
      milestone_id: '4f0d5c66-433b-4b1b-8f9e-6c2b7a9d1006',
      fields: ['title'],
      from_status: 'planning',
      to_status: 'in_progress',
    });
    expect(parsed.to_status).toBe('in_progress');
  });
});
