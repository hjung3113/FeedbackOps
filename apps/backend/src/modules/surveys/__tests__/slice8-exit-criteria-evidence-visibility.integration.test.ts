// Slice 8 exit criteria: evidence derived from a protected Survey Response
// keeps its internal provenance while exposing only the approved safe contract.

import { randomUUID } from "node:crypto";

import {
  evidenceHighlightDtoSchema,
  findingDtoSchema,
  surveyResultDtoSchema,
  taskDetailDtoSchema,
  taskRequestDtoSchema,
} from "@fops/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config.js";
import { type DbHandle, createDb } from "../../../db/client.js";
import { buildServer } from "../../../server.js";
import {
  SESSION_COOKIE_NAME,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
} from "../../voc/__tests__/_seed-helpers.js";
import { insertTaskRow } from "../../tasks/__tests__/_seed-helpers.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG = "it-slice8-exit-criteria-evidence";
const RAW =
  "raw identity-protected response that must remain in the survey route";
const APPROVED = "Approved operational summary";

type Source = {
  msId: string;
  surveyId: string;
  questionId: string;
  responseId: string;
};

describe.skipIf(!runIntegration)(
  "Slice 8 exit criteria: survey evidence visibility (#190)",
  () => {
    let appHandle: DbHandle;
    let migrateHandle: DbHandle;
    let app: FastifyInstance;
    let adminId: string;
    let adminCookie: string;

    beforeAll(async () => {
      process.env.NODE_ENV = "test";
      appHandle = createDb(APP_URL);
      migrateHandle = createDb(MIGRATE_URL);
      app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
      await app.ready();
      adminCookie = await loginAs(app, "mock-admin-1");
      const admin = await migrateHandle.pool.query<{ id: string }>(
        "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
        [WORKSPACE_ID],
      );
      adminId = admin.rows[0]?.id ?? "";
      if (!adminId) throw new Error("mock admin fixture is missing");
    });
    beforeEach(async () => cleanup());
    afterAll(async () => {
      await cleanup();
      await app?.close();
      await appHandle?.close();
      await migrateHandle?.close();
    });

    async function cleanup(): Promise<void> {
      if (!migrateHandle) return;
      const systems =
        "select id from core.managed_systems where workspace_id=$1 and slug like $2";
      const surveys = `select id from survey.surveys where workspace_id=$1 and primary_managed_system_id in (${systems})`;
      const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
      const findings = `select id from finding.findings where workspace_id=$1 and primary_managed_system_id in (${systems})`;
      const tasks = `select id from task.tasks where workspace_id=$1 and primary_managed_system_id in (${systems})`;
      const taskRequests = `select id from task_request.task_requests where workspace_id=$1 and primary_managed_system_id in (${systems})`;
      await migrateHandle.pool.query(
        `delete from core.audit_log where workspace_id=$1 and (subject_id in (${responses}) or subject_id in (${findings}) or subject_id in (${tasks}) or subject_id in (${taskRequests}) or actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2))`,
        [WORKSPACE_ID, `${SLUG}-%`],
      );
      await migrateHandle.pool.query(
        `delete from core.entity_links where workspace_id=$1 and (source_id in (${responses}) or source_id in (${findings}) or source_id in (${taskRequests}) or target_id in (${findings}) or target_id in (${tasks}) or target_id in (${taskRequests}))`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from task.tasks where id in (${tasks})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from task_request.task_requests where id in (${taskRequests})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from finding.evidence_highlights where finding_id in (${findings})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from finding.findings where id in (${findings})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from survey.survey_response_answers where response_id in (${responses})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from survey.survey_responses where id in (${responses})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from survey.survey_questions where survey_id in (${surveys})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from survey.surveys where id in (${surveys})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from permission.permission_grants where managed_system_id in (${systems})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        "delete from core.idempotency_keys where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)",
        [WORKSPACE_ID, `${SLUG}-%`],
      );
      await migrateHandle.pool.query(
        "delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)",
        [WORKSPACE_ID, `${SLUG}-%`],
      );
      await migrateHandle.pool.query(
        "delete from core.actors where workspace_id=$1 and external_id like $2",
        [WORKSPACE_ID, `${SLUG}-%`],
      );
      await migrateHandle.pool.query(
        `delete from core.managed_systems where id in (${systems})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        "delete from core.rate_limits where key like $1 || '%'",
        [WORKSPACE_ID],
      );
    }
    async function actor(label: string) {
      const seeded = await insertDevActor(
        migrateHandle,
        WORKSPACE_ID,
        `${SLUG}-${label}-${randomUUID()}`,
      );
      return { ...seeded, cookie: await loginAs(app, seeded.externalId) };
    }
    async function grant(actorId: string, capability: string, msId: string) {
      await grantCapability(
        migrateHandle,
        WORKSPACE_ID,
        actorId,
        capability,
        msId,
        adminId,
      );
    }
    function headers(cookie: string, mutation = false): Record<string, string> {
      return {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        ...(mutation
          ? {
              "content-type": "application/json",
              "idempotency-key": randomUUID(),
            }
          : {}),
      };
    }
    async function seed(): Promise<Source> {
      const msId = await insertMsDirectly(
        migrateHandle,
        WORKSPACE_ID,
        uid(SLUG),
        "Slice 8 Evidence MS",
      );
      const survey = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at) values ($1,$2,'outcome','open',$3,$4,$5,true,$5,now()) returning id`,
        [
          WORKSPACE_ID,
          `S-${randomUUID()}`,
          `${SLUG}-${randomUUID()}`,
          msId,
          adminId,
        ],
      );
      const surveyId = survey.rows[0]?.id ?? "";
      const question = await migrateHandle.pool.query<{ id: string }>(
        "insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth) values ($1,$2,'text','What should improve?',true,0,0) returning id",
        [WORKSPACE_ID, surveyId],
      );
      const questionId = question.rows[0]?.id ?? "";
      const response = await migrateHandle.pool.query<{ id: string }>(
        "insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,true,now()) returning id",
        [WORKSPACE_ID, surveyId, adminId],
      );
      const responseId = response.rows[0]?.id ?? "";
      await migrateHandle.pool.query(
        "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,'text',$5::jsonb)",
        [WORKSPACE_ID, surveyId, responseId, questionId, JSON.stringify(RAW)],
      );
      return { msId, surveyId, questionId, responseId };
    }
    async function approveAndCreate(
      source: Source,
      creator: { cookie: string },
    ): Promise<string> {
      const approval = await app.inject({
        method: "POST",
        url: `/survey-responses/${source.responseId}/approved-excerpts`,
        headers: headers(creator.cookie),
        payload: { question_id: source.questionId, redacted_excerpt: APPROVED },
      });
      expect(approval.statusCode).toBe(201);
      const created = await app.inject({
        method: "POST",
        url: `/survey-responses/${source.responseId}/create-finding`,
        headers: headers(creator.cookie, true),
        payload: {
          severity: "medium",
          approved_excerpt_ids: [
            approval.json<{ approved_excerpt_id: string }>()
              .approved_excerpt_id,
          ],
        },
      });
      expect(created.statusCode).toBe(201);
      return created.json<{ id: string }>().id;
    }
    async function authorizeCreator(source: Source) {
      const creator = await actor("creator");
      for (const capability of [
        "survey.read",
        "survey.read_personal_responses",
        "survey.manage",
        "finding.manage",
        "finding.read",
      ])
        await grant(creator.id, capability, source.msId);
      return creator;
    }

    it("persists Survey Response provenance and auditable approved evidence while its only raw-text route remains capability-gated", async () => {
      const source = await seed();
      const creator = await authorizeCreator(source);
      const findingId = await approveAndCreate(source, creator);
      const persisted = await migrateHandle.pool.query<{
        source_type: string;
        source_id: string;
        highlight_type: string;
        highlight_id: string;
      }>(
        `select f.source_type,f.source_id,h.source_type as highlight_type,h.source_id as highlight_id from finding.findings f join finding.evidence_highlights h on h.finding_id=f.id where f.id=$1`,
        [findingId],
      );
      expect(persisted.rows).toEqual([
        {
          source_type: "survey_response",
          source_id: source.responseId,
          highlight_type: "survey_response",
          highlight_id: source.responseId,
        },
      ]);
      const audit = await migrateHandle.pool.query<{
        event_type: string;
        subject_type: string;
        detail: Record<string, unknown>;
      }>(
        "select event_type,subject_type,detail from core.audit_log where subject_id=$1 or detail->>'survey_response_id'=$2 or detail->>'source_survey_response_id'=$2",
        [findingId, source.responseId],
      );
      expect(audit.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: "survey_response_excerpt_approved",
            subject_type: "survey_response_excerpt_approval",
            detail: expect.objectContaining({ survey_response_id: source.responseId }),
          }),
          expect.objectContaining({
            event_type: "finding_created_from_survey_response",
            detail: expect.objectContaining({ source_survey_response_id: source.responseId }),
          }),
          expect.objectContaining({
            event_type: "evidence_highlight_added",
            subject_type: "finding",
            detail: expect.objectContaining({ source_id: source.responseId }),
          }),
        ]),
      );
      const raw = await app.inject({
        method: "POST",
        url: `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
        headers: headers(creator.cookie),
        payload: { question_id: source.questionId },
      });
      expect(raw.statusCode).toBe(200);
      expect(raw.json()).toMatchObject({ raw_text: RAW });
    });

    it("uses the positive public DTO allowlist on Finding/evidence surfaces and allows raw respondent detail only on the Survey source route", async () => {
      const source = await seed();
      const creator = await authorizeCreator(source);
      const reader = await actor("safe-reader");
      const capHolder = await actor("personal-cap-holder");
      await grant(reader.id, "survey.read", source.msId);
      await grant(reader.id, "finding.read", source.msId);
      for (const capability of [
        "survey.read",
        "survey.read_personal_responses",
        "finding.read",
        "finding.manage",
      ])
        await grant(capHolder.id, capability, source.msId);
      const findingId = await approveAndCreate(source, creator);
      const requested = await app.inject({
        method: "POST",
        url: `/findings/${findingId}/request-task`,
        headers: headers(creator.cookie, true),
        payload: {
          evidence_summary: "Safe operational handoff",
          requested_outcome: "Review without respondent disclosure",
        },
      });
      expect(requested.statusCode).toBe(201);
      const taskRequest = taskRequestDtoSchema.parse(requested.json());
      const task = await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: source.msId,
        createdBy: adminId,
        title: "Safe linked task surface",
      });
      await migrateHandle.pool.query(
        "insert into core.entity_links (workspace_id,source_type,source_id,target_type,target_id,relation_type,visibility,status,managed_system_id,created_by) values ($1,'finding',$2,'task',$3,'requested_task','internal_only','active',$4,$5)",
        [WORKSPACE_ID, findingId, task.id, source.msId, adminId],
      );
      const finding = await app.inject({
        method: "GET",
        url: `/findings/${findingId}`,
        headers: headers(reader.cookie),
      });
      const evidence = await app.inject({
        method: "GET",
        url: `/findings/${findingId}/evidence-highlights`,
        headers: headers(reader.cookie),
      });
      expect(finding.statusCode).toBe(200);
      expect(evidence.statusCode).toBe(200);
      const parsedFinding = findingDtoSchema.parse(finding.json());
      expect(Object.keys(parsedFinding).sort()).toEqual(
        [
          "analytics_area_id",
          "confidence",
          "created_at",
          "created_by",
          "display_id",
          "evidence_count",
          "id",
          "linked_milestone_id",
          "linked_task_id",
          "primary_managed_system_id",
          "severity",
          "source_type",
          "status",
          "summary",
          "title",
          "updated_at",
          "workspace_id",
        ].sort(),
      );
      const items = evidence.json<{ items: unknown[] }>().items;
      expect(items).toHaveLength(1);
      for (const item of items) {
        const parsed = evidenceHighlightDtoSchema.parse(item);
        expect(Object.keys(parsed).sort()).toEqual(
          [
            "analytics_area_id",
            "created_at",
            "created_by",
            "finding_id",
            "id",
            "importance",
            "primary_managed_system_id",
            "quote_or_summary",
            "sentiment",
            "source_meta",
            "source_title",
            "source_type",
            "workspace_id",
          ].sort(),
        );
      }
      expect(Object.keys(taskRequest).sort()).toEqual(
        [
          "created_at",
          "decision_reason",
          "decided_at",
          "display_id",
          "evidence_summary",
          "id",
          "primary_managed_system_id",
          "requested_outcome",
          "requester_actor_id",
          "reviewer_actor_id",
          "source",
          "source_id",
          "source_type",
          "status",
          "updated_at",
          "workspace_id",
        ].sort(),
      );
      for (const payload of [finding.body, evidence.body]) {
        expect(payload).toContain(APPROVED);
      }
      for (const payload of [finding.body, evidence.body, requested.body]) {
        expect(payload).not.toContain(RAW);
        expect(payload).not.toContain(source.responseId);
        expect(payload).not.toContain("mock-admin-1");
      }
      for (const cookie of [creator.cookie, capHolder.cookie]) {
        const linkedFinding = await app.inject({
          method: "GET",
          url: `/findings/${findingId}`,
          headers: headers(cookie),
        });
        const linkedEvidence = await app.inject({
          method: "GET",
          url: `/findings/${findingId}/evidence-highlights`,
          headers: headers(cookie),
        });
        const linkedRequests = await app.inject({
          method: "GET",
          url: "/task-requests?status=pending_review",
          headers: headers(cookie),
        });
        const linkedTask = await app.inject({
          method: "GET",
          url: `/tasks/${task.id}`,
          headers: headers(cookie),
        });
        expect(linkedFinding.statusCode).toBe(200);
        expect(linkedEvidence.statusCode).toBe(200);
        expect(linkedRequests.statusCode).toBe(200);
        expect(linkedTask.statusCode).toBe(200);
        const listedRequest = linkedRequests
          .json<{ items: unknown[] }>()
          .items.find(
            (item): item is Record<string, unknown> =>
              typeof item === "object" &&
              item !== null &&
              (item as Record<string, unknown>).id === taskRequest.id,
          );
        expect(listedRequest).toBeDefined();
        expect(Object.keys(taskRequestDtoSchema.parse(listedRequest)).sort()).toEqual(
          Object.keys(taskRequest).sort(),
        );
        const parsedTask = taskDetailDtoSchema.parse(linkedTask.json());
        expect(Object.keys(parsedTask).sort()).toEqual(
          [
            "analytics_area_id",
            "assignee_actor_id",
            "created_at",
            "created_by",
            "display_id",
            "due_date",
            "id",
            "milestone_id",
            "primary_managed_system_id",
            "priority",
            "source",
            "source_task_request_id",
            "status",
            "title",
            "updated_at",
            "workspace_id",
          ].sort(),
        );
        for (const payload of [
          linkedFinding.body,
          linkedEvidence.body,
          linkedRequests.body,
          linkedTask.body,
        ]) {
          expect(payload).not.toContain(RAW);
          expect(payload).not.toContain(source.responseId);
          expect(payload).not.toContain("mock-admin-1");
        }
      }
      const deniedRaw = await app.inject({
        method: "POST",
        url: `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
        headers: headers(reader.cookie),
        payload: { question_id: source.questionId },
      });
      expect(deniedRaw.statusCode).toBe(404);
      const allowedRaw = await app.inject({
        method: "POST",
        url: `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
        headers: headers(creator.cookie),
        payload: { question_id: source.questionId },
      });
      expect(allowedRaw.statusCode).toBe(200);
      expect(allowedRaw.json()).toMatchObject({ raw_text: RAW });
    });

    it("retains threshold-five suppression after derivation and emits a source-readable/target-unreadable hidden stub", async () => {
      const source = await seed();
      const creator = await authorizeCreator(source);
      const aggregateReader = await actor("aggregate-reader");
      const capHolder = await actor("personal-cap-holder");
      const noPermission = await actor("no-permission");
      await grant(aggregateReader.id, "survey.read", source.msId);
      await grant(aggregateReader.id, "finding.read", source.msId);
      for (const capability of [
        "survey.read",
        "survey.read_personal_responses",
        "finding.read",
      ])
        await grant(capHolder.id, capability, source.msId);
      const rating = await migrateHandle.pool.query<{ id: string }>(
        "insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,rating_min,rating_max,sort_order,branch_depth) values ($1,$2,'rating','Rate this',false,1,5,1,0) returning id",
        [WORKSPACE_ID, source.surveyId],
      );
      const ratingId = rating.rows[0]?.id ?? "";
      // Four distinct respondent identities: below the threshold is not an artefact of duplicate rows.
      for (let index = 0; index < 3; index += 1) {
        const respondent = await actor(`respondent-${index}`);
        const response = await migrateHandle.pool.query<{ id: string }>(
          "insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,true,now()) returning id",
          [WORKSPACE_ID, source.surveyId, respondent.id],
        );
        await migrateHandle.pool.query(
          "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,'rating','3'::jsonb)",
          [WORKSPACE_ID, source.surveyId, response.rows[0]?.id, ratingId],
        );
      }
      await migrateHandle.pool.query(
        "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,'rating','3'::jsonb)",
        [WORKSPACE_ID, source.surveyId, source.responseId, ratingId],
      );
      const before = surveyResultDtoSchema.parse(
        (
          await app.inject({
            method: "GET",
            url: `/surveys/${source.surveyId}/results`,
            headers: headers(aggregateReader.cookie),
          })
        ).json(),
      );
      expect(before.questions).toContainEqual({
        question_id: ratingId,
        visibility: "suppressed",
        response_count: null,
        suppression: { code: "anonymity_threshold" },
      });
      expect(before.next_actions).toEqual([]);
      const findingId = await approveAndCreate(source, creator);
      const after = surveyResultDtoSchema.parse(
        (
          await app.inject({
            method: "GET",
            url: `/surveys/${source.surveyId}/results`,
            headers: headers(aggregateReader.cookie),
          })
        ).json(),
      );
      expect(after.questions).toContainEqual({
        question_id: ratingId,
        visibility: "suppressed",
        response_count: null,
        suppression: { code: "anonymity_threshold" },
      });
      expect(after.next_actions).toEqual([]);
      const targetMs = await insertMsDirectly(
        migrateHandle,
        WORKSPACE_ID,
        uid(SLUG),
        "Slice 8 unreadable task MS",
      );
      const task = await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: targetMs,
        createdBy: adminId,
        title: "Hidden task target",
      });
      await migrateHandle.pool.query(
        "insert into core.entity_links (workspace_id,source_type,source_id,target_type,target_id,relation_type,visibility,status,managed_system_id,created_by) values ($1,'finding',$2,'task',$3,'requested_task','internal_only','active',$4,$5)",
        [WORKSPACE_ID, findingId, task.id, source.msId, adminId],
      );
      for (const [label, cookie, visibility] of [
        ["creator", creator.cookie, "hidden"],
        ["personal-cap-holder", capHolder.cookie, "hidden"],
        ["admin", adminCookie, "allowed"],
        ["aggregate-reader", aggregateReader.cookie, "hidden"],
        ["no-permission", noPermission.cookie, "hidden"],
      ] as const) {
        const links = await app.inject({
          method: "GET",
          url: `/entity-links?source_type=finding&source_id=${findingId}`,
          headers: headers(cookie),
        });
        expect(links.statusCode, label).toBe(200);
        const linked = links
          .json<{ items: Array<Record<string, unknown>> }>()
          .items.find(
            (item) =>
              item.source_type === "finding" &&
              item.target_type === "task" &&
              item.relation_type === "requested_task",
          );
        expect(linked, label).toEqual(
          expect.objectContaining({ visibility_state: visibility }),
        );
        if (visibility === "hidden") {
          expect(linked, label).not.toHaveProperty("source_id");
          expect(linked, label).not.toHaveProperty("target_id");
          expect(linked, label).not.toHaveProperty("summary");
        }
      }
    });
  },
);
