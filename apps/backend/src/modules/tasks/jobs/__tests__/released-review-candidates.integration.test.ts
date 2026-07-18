import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuditService } from "../../../core/audit/index.js";
import { type DbHandle, createDb } from "../../../../db/client.js";
import {
  insertMsDirectly,
  insertVocDirectly,
  uid,
} from "../../../voc/__tests__/_seed-helpers.js";
import { insertTaskRow } from "../../__tests__/_seed-helpers.js";
import { releasedReviewCandidatesHandler } from "../released-review-candidates.js";
import { createPublicUpdateReviewCandidatesService } from "../../../voc/public-update-review-candidates/service.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = "it-release-candidate";

describe.skipIf(!runIntegration)(
  "released Task review-candidate worker (#165)",
  () => {
    let appHandle: DbHandle;
    let migrateHandle: DbHandle;
    let actorId: string;

    beforeAll(async () => {
      appHandle = createDb(APP_URL);
      migrateHandle = createDb(MIGRATE_URL);
      const actors = await appHandle.pool.query<{ id: string }>(
        `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
        [WORKSPACE_ID],
      );
      actorId = actors.rows[0]?.id ?? "";
      if (!actorId) throw new Error("seed admin actor not found");
    });
    beforeEach(async () => cleanup());
    afterAll(async () => {
      await cleanup();
      await appHandle?.close();
      await migrateHandle?.close();
    });

    async function cleanup(): Promise<void> {
      if (!migrateHandle) return;
      await migrateHandle.pool.query(
        `delete from core.audit_log where event_type = 'public_update_review_candidate_created' and workspace_id = $1`,
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        `delete from voc.public_update_review_candidates where workspace_id = $1`,
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        `delete from core.entity_links where workspace_id = $1 and managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from task.tasks where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
    }

    it("inserts once, audits only inserted rows, and never changes VOC public state", async () => {
      const msId = await insertMsDirectly(
        appHandle,
        WORKSPACE_ID,
        uid(SLUG_PREFIX),
        "Release candidate MS",
      );
      const task = await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        createdBy: actorId,
      });
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        msId,
        actorId,
        "Candidate VOC",
      );
      const link = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility, status, managed_system_id, created_by)
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5) returning id`,
        [WORKSPACE_ID, voc.id, task.id, msId, actorId],
      );
      const before = await appHandle.pool.query<{
        reporter_facing_status: string;
        updates: string;
      }>(
        `select reporter_facing_status, (select count(*)::text from voc.voc_public_updates where voc_id = $1) as updates from voc.vocs where id = $1`,
        [voc.id],
      );
      const handler = releasedReviewCandidatesHandler({
        publicUpdateReviewCandidatesService:
          createPublicUpdateReviewCandidatesService({
            db: appHandle.db,
            auditService: createAuditService(),
          }),
      });
      const payload = {
        workspace_id: WORKSPACE_ID,
        task_id: task.id,
        release_event_id: randomUUID(),
        correlation_id: randomUUID(),
        triggered_by_actor_id: actorId,
        linked_vocs: [{ voc_id: voc.id, entity_link_id: link.rows[0]!.id }],
      };
      await handler([{ data: payload }]);
      await handler([{ data: payload }]);
      const candidates = await appHandle.pool.query(
        `select * from voc.public_update_review_candidates where voc_id = $1`,
        [voc.id],
      );
      const audit = await appHandle.pool.query(
        `select * from core.audit_log where event_type = 'public_update_review_candidate_created' and subject_id = $1`,
        [voc.id],
      );
      const after = await appHandle.pool.query<{
        reporter_facing_status: string;
        updates: string;
      }>(
        `select reporter_facing_status, (select count(*)::text from voc.voc_public_updates where voc_id = $1) as updates from voc.vocs where id = $1`,
        [voc.id],
      );
      expect(candidates.rowCount).toBe(1);
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0]?.actor_id).toBe(actorId);
      expect(after.rows[0]).toEqual(before.rows[0]);

      // A new release cannot duplicate an unresolved obligation, but once a
      // reviewer terminalizes it, a later real release is a new obligation.
      await handler([{ data: { ...payload, release_event_id: randomUUID() } }]);
      const stillPending = await appHandle.pool.query(
        `select 1 from voc.public_update_review_candidates where voc_id = $1`,
        [voc.id],
      );
      expect(stillPending.rowCount).toBe(1);
      await migrateHandle.pool.query(
        `update voc.public_update_review_candidates
            set status = 'dismissed', resolved_by_actor_id = $2, resolved_at = now(), dismissal_reason = 'Reviewed manually'
          where voc_id = $1`,
        [voc.id, actorId],
      );
      await handler([{ data: { ...payload, release_event_id: randomUUID() } }]);
      const afterTerminal = await appHandle.pool.query(
        `select 1 from voc.public_update_review_candidates where voc_id = $1`,
        [voc.id],
      );
      expect(afterTerminal.rowCount).toBe(2);
    });
  },
);
