// apps/backend/src/modules/voc/cursor.ts
//
// Cursor codec for GET /vocs list pagination.
//
// Format: base64(JSON({ s, d, sv, id }))
//   s  = sort key matching the query sort enum
//   d  = 'asc' | 'desc'
//   sv = sort value of the last row in the previous page
//        - created_at sorts: ISO date string
//        - severity sorts: ordinal int 1..4 (low=1 medium=2 high=3 critical=4)
//        - reporter_facing_status: string
//        - triage_pinned (internal): composite string `${unassignedBool}|${sevOrd}|${createdAtIso}`
//   id = UUID tiebreaker (last row id)
//
// The cursor MUST encode `s` and `d` matching the current request sort/dir.
// Mismatches are rejected as invalid_cursor to prevent stale cursors from
// silently paginating in the wrong order after a sort change.

import { z } from 'zod';

import { HttpError } from '../../lib/errors.js';

// ── Sort config ──────────────────────────────────────────────────────────────
// Column whitelist: maps sort enum → { column, severityOrdinal? }.
// severityOrdinal=true means the comparison uses a CASE severity expression
// (ordinal 1..4) rather than the raw text column.
// 'triage_pinned' is an internal sort key for view='triage'; it uses
// a composite tuple (unassigned_bool, severity_ord, created_at, id).

export const SORT_KEYS = [
  'created_at:desc',
  'created_at:asc',
  'severity:asc',
  'severity:desc',
  'reporter_facing_status:asc',
  'triage_pinned', // internal only — not exposed to API callers
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export interface SortConfig {
  column: string;
  severityOrdinal?: true;
  triagePinned?: true;
}

export const SORT_CONFIG: Record<SortKey, SortConfig> = {
  'created_at:desc': { column: 'created_at' },
  'created_at:asc': { column: 'created_at' },
  'severity:asc': { column: 'severity', severityOrdinal: true },
  'severity:desc': { column: 'severity', severityOrdinal: true },
  'reporter_facing_status:asc': { column: 'reporter_facing_status' },
  triage_pinned: { column: 'triage_pinned', triagePinned: true },
};

// ── Severity ordinal mapping ─────────────────────────────────────────────────
// Maps natural ranking: low < medium < high < critical.
// Used both for cursor encoding and SQL CASE expressions.
export const SEVERITY_ORDINAL: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityToOrdinal(severity: string): number {
  const ord = SEVERITY_ORDINAL[severity];
  if (ord === undefined) throw new Error(`Unknown severity: ${severity}`);
  return ord;
}

// ── Codec ────────────────────────────────────────────────────────────────────

const decodedCursorSchema = z.object({
  s: z.string(),
  d: z.enum(['asc', 'desc']),
  sv: z.union([z.string(), z.number()]),
  id: z.string().uuid(),
});

export type DecodedCursor = z.infer<typeof decodedCursorSchema>;

export function encodeCursor(input: {
  s: string;
  d: 'asc' | 'desc';
  sv: string | number;
  id: string;
}): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64');
}

export function decodeCursor(
  raw: string,
  expectSort: string,
  expectDir: 'asc' | 'desc',
): DecodedCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });

  // Decode base64.
  let json: string;
  try {
    json = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw fail();
  }

  // Parse JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw fail();
  }

  // Validate shape via zod.
  const result = decodedCursorSchema.safeParse(parsed);
  if (!result.success) throw fail();

  const cursor = result.data;

  // s must match current sort key.
  if (cursor.s !== expectSort) throw fail();

  // d must match current direction.
  if (cursor.d !== expectDir) throw fail();

  return cursor;
}
