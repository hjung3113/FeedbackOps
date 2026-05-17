// Slice 3 #12 — deterministic VOC seed fixtures.
//
// 12 VOC rows spanning every reporter_facing_status, triage_state, severity,
// source_context, and owner combination. Three conversation rows per VOC
// (one public_update, one reporter_reply, one internal_comment). Two VOCs
// carry a linkedFinding permission decision in voc_permission_decisions_seed_fixture.
//
// Idempotency: delete-and-recreate all seed rows scoped by workspace +
// title prefix '[seed]' on each invocation. ON DELETE cascade from vocs
// clears conversation + fixture rows automatically.
//
// Stable UUIDs: sha1('fops-slice3-voc:<label>') → UUID v5-style (bits set
// per RFC 4122 §4.3 — version nibble = 5, variant bits = 10xx).

import { createHash } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import type { DbHandle } from '../db/client.js';
import { vocPublicUpdates, vocReporterReplies, vocInternalComments, vocs } from '../db/schema/voc.js';
import { actors, analyticsAreas, managedSystems, teams } from '../db/schema/core.js';

// ── Stable UUID helper ─────────────────────────────────────────────────────
const NAMESPACE = 'fops-slice3-voc';

/**
 * Returns a deterministic UUID v5-style value by SHA-1 hashing the given
 * label. Version nibble (13th hex char) is forced to '5'; variant nibble
 * (17th hex char) is forced to '8' (variant 1, RFC 4122 §4.1.1).
 */
function stableUuid(label: string): string {
  const h = createHash('sha1').update(`${NAMESPACE}:${label}`).digest('hex');
  const chars = h.split('');
  // Set version = 5
  chars[12] = '5';
  // Set variant = 8..b (10xx → 8)
  chars[16] = '8';
  return [
    chars.slice(0, 8).join(''),
    chars.slice(8, 12).join(''),
    chars.slice(12, 16).join(''),
    chars.slice(16, 20).join(''),
    chars.slice(20, 32).join(''),
  ].join('-');
}

const SEED_EVALUATED_AT = '2026-05-17T10:00:00.000Z';
const RICH_EMPTY = { type: 'doc', content: [] } as const;

interface VocSeedRow {
  label: string;
  displayNum: string; // zero-padded 2-digit number e.g. '01'
  status:
    | 'received'
    | 'reviewing'
    | 'assigned'
    | 'progress'
    | 'prep'
    | 'resolved'
    | 'reopened'
    | 'closed';
  triage: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  source: 'direct_use' | 'proxy_report' | 'operational_discovery' | 'stakeholder_request';
  owner: 'user' | 'team' | 'none';
  decision?: {
    kind: 'linkedFinding';
    state: 'request_access' | 'summary_visible';
    reason: string;
  };
}

const SEED_ROWS: VocSeedRow[] = [
  // 1. received / untriaged / null severity / direct_use / no owner
  { label: 'voc-01', displayNum: '01', status: 'received',  triage: 'untriaged',                severity: null,       source: 'direct_use',            owner: 'none' },
  // 2. reviewing / untriaged / null severity / proxy_report / user owner
  { label: 'voc-02', displayNum: '02', status: 'reviewing', triage: 'untriaged',                severity: null,       source: 'proxy_report',          owner: 'user' },
  // 3. assigned / triaged / low / stakeholder_request / team owner
  { label: 'voc-03', displayNum: '03', status: 'assigned',  triage: 'triaged',                  severity: 'low',      source: 'stakeholder_request',   owner: 'team' },
  // 4. progress / triaged / medium / operational_discovery / user owner
  { label: 'voc-04', displayNum: '04', status: 'progress',  triage: 'triaged',                  severity: 'medium',   source: 'operational_discovery', owner: 'user' },
  // 5. prep / triaged / high / direct_use / team owner
  { label: 'voc-05', displayNum: '05', status: 'prep',      triage: 'triaged',                  severity: 'high',     source: 'direct_use',            owner: 'team' },
  // 6. resolved / triaged / critical / direct_use / user owner
  { label: 'voc-06', displayNum: '06', status: 'resolved',  triage: 'triaged',                  severity: 'critical', source: 'direct_use',            owner: 'user' },
  // 7. reopened / triaged / medium / direct_use / user owner
  { label: 'voc-07', displayNum: '07', status: 'reopened',  triage: 'triaged',                  severity: 'medium',   source: 'direct_use',            owner: 'user' },
  // 8. closed / triaged / low / proxy_report / team owner
  { label: 'voc-08', displayNum: '08', status: 'closed',    triage: 'triaged',                  severity: 'low',      source: 'proxy_report',          owner: 'team' },
  // 9. received / needs_more_information / null severity / direct_use / no owner
  { label: 'voc-09', displayNum: '09', status: 'received',  triage: 'needs_more_information',   severity: null,       source: 'direct_use',            owner: 'none' },
  // 10. received / dismissed_not_actionable / null severity / direct_use / no owner
  { label: 'voc-10', displayNum: '10', status: 'received',  triage: 'dismissed_not_actionable', severity: null,       source: 'direct_use',            owner: 'none' },
  // 11. progress / triaged / high / direct_use / user + request_access linkedFinding
  {
    label: 'voc-11', displayNum: '11', status: 'progress',  triage: 'triaged',                  severity: 'high',     source: 'direct_use',            owner: 'user',
    decision: { kind: 'linkedFinding', state: 'request_access', reason: 'developer_outside_managed_system_scope' },
  },
  // 12. resolved / triaged / medium / direct_use / user + summary_visible linkedFinding
  {
    label: 'voc-12', displayNum: '12', status: 'resolved',  triage: 'triaged',                  severity: 'medium',   source: 'direct_use',            owner: 'user',
    decision: { kind: 'linkedFinding', state: 'summary_visible', reason: 'restricted_finding_same_managed_system' },
  },
];

export interface VocSeedResult {
  vocsInserted: number;
  conversationRowsInserted: number;
  permissionFixturesInserted: number;
}

export async function seedSlice3Vocs(handle: DbHandle, workspaceId: string): Promise<VocSeedResult> {
  return handle.db.transaction(async (tx) => {
    // ── Idempotency: delete seed rows by title prefix ─────────────────────
    // ON DELETE cascade clears voc_public_updates, voc_reporter_replies,
    // voc_internal_comments, voc_attachments, and voc_permission_decisions_seed_fixture.
    await tx.delete(vocs).where(
      and(eq(vocs.workspaceId, workspaceId), sql`${vocs.title} LIKE '[seed]%'`),
    );

    // ── Resolve first managed system ──────────────────────────────────────
    const [ms] = await tx
      .select({ id: managedSystems.id })
      .from(managedSystems)
      .where(
        and(
          eq(managedSystems.workspaceId, workspaceId),
          sql`${managedSystems.archivedAt} IS NULL`,
        ),
      )
      .orderBy(managedSystems.createdAt)
      .limit(1);
    if (!ms) throw new Error('seedSlice3Vocs: no managed_systems row for workspace');

    // ── Resolve a matching analytics area (optional) ─────────────────────
    const [aa] = await tx
      .select({ id: analyticsAreas.id })
      .from(analyticsAreas)
      .where(
        and(
          eq(analyticsAreas.workspaceId, workspaceId),
          eq(analyticsAreas.managedSystemId, ms.id),
          sql`${analyticsAreas.archivedAt} IS NULL`,
        ),
      )
      .limit(1);

    // ── Resolve first actor in workspace (used as reporter + user owner) ──
    const [reporter] = await tx
      .select({ id: actors.id })
      .from(actors)
      .where(eq(actors.workspaceId, workspaceId))
      .orderBy(actors.createdAt)
      .limit(1);
    if (!reporter) throw new Error('seedSlice3Vocs: no actors row for workspace');

    // ── Resolve seed team (inserted by migration 0010 as fops_migrate) ──────
    // ADR-0019: fops_app has no INSERT on core.teams until the Slice that ships
    // team CRUD. The '[seed] VOC owner team' row is a migration-time fixture;
    // the seed CLI only needs SELECT here.
    const SEED_TEAM_NAME = '[seed] VOC owner team';
    const [existingTeam] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.workspaceId, workspaceId), eq(teams.name, SEED_TEAM_NAME)))
      .limit(1);
    if (!existingTeam) {
      throw new Error(
        `seed: missing [seed] VOC owner team for workspace ${workspaceId}. ` +
        `Migration 0010 should have inserted it; check migration ran.`,
      );
    }
    const seedTeamId = existingTeam.id;

    let convRows = 0;
    let fixtureRows = 0;

    for (const row of SEED_ROWS) {
      const vocId = stableUuid(row.label);

      // ── Insert VOC ──────────────────────────────────────────────────────
      await tx.insert(vocs).values({
        id: vocId,
        workspaceId,
        // Bypass next_voc_display_id() — fixture rows use deterministic slugs
        // so seed is stable across DB resets. Production CREATE route still
        // calls next_voc_display_id().
        displayId: `VOC-SEED-${row.displayNum}`,
        primaryManagedSystemId: ms.id,
        analyticsAreaId: aa?.id ?? null,
        reporterId: reporter.id,
        title: `[seed] ${row.label} ${row.status}`,
        descriptionRichContent: RICH_EMPTY,
        severity: row.severity,
        reporterFacingStatus: row.status,
        triageState: row.triage,
        ownerUserId: row.owner === 'user' ? reporter.id : null,
        ownerTeamId: row.owner === 'team' ? seedTeamId : null,
        sourceContext: row.source,
      });

      // ── Insert three conversation rows ──────────────────────────────────
      // public_update (any actor)
      await tx.insert(vocPublicUpdates).values({
        id: stableUuid(`${row.label}:public-update-1`),
        vocId,
        actorId: reporter.id,
        bodyRichContent: RICH_EMPTY,
        reporterFacingStatusBefore: row.status,
        reporterFacingStatusAfter: row.status,
      });
      // reporter_reply (trigger enforces actor = reporter)
      await tx.insert(vocReporterReplies).values({
        id: stableUuid(`${row.label}:reporter-reply-1`),
        vocId,
        actorId: reporter.id,
        bodyRichContent: RICH_EMPTY,
      });
      // internal_comment (any actor)
      await tx.insert(vocInternalComments).values({
        id: stableUuid(`${row.label}:internal-comment-1`),
        vocId,
        actorId: reporter.id,
        bodyRichContent: RICH_EMPTY,
      });
      convRows += 3;

      // ── Insert permission decision fixture (voc-11, voc-12 only) ────────
      if (row.decision) {
        const envelope = {
          linkedFinding: {
            decision_id: stableUuid(`${row.label}:decision:linkedFinding`),
            state: row.decision.state,
            evaluated_at: SEED_EVALUATED_AT,
            reason: row.decision.reason,
          },
        };
        await tx.execute(
          sql`
            INSERT INTO voc.voc_permission_decisions_seed_fixture (voc_id, envelope)
            VALUES (${vocId}, ${JSON.stringify(envelope)}::jsonb)
          `,
        );
        fixtureRows += 1;
      }
    }

    return {
      vocsInserted: SEED_ROWS.length,
      conversationRowsInserted: convRows,
      permissionFixturesInserted: fixtureRows,
    };
  });
}
