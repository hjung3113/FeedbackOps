// Slice 8 exit criteria: the Survey Response boundary is a route-level
// contract.  Existing focused suites cover each command; this suite pins their
// union so a future route or registry addition cannot reintroduce VOC creation.

import { randomUUID } from "node:crypto";

import {
  type SurveyResultNextAction,
  surveyResultDtoSchema,
} from "@fops/shared";
import type { FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import { loadConfig } from "../../../config.js";
import { type DbHandle, createDb } from "../../../db/client.js";
import { buildServer } from "../../../server.js";
import {
  SESSION_COOKIE_NAME,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from "../../voc/__tests__/_seed-helpers.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG = "it-slice8-exit-criteria-response-voc";

type Source = {
  msId: string;
  surveyId: string;
  questionId: string;
  responseId: string;
};

describe.skipIf(!runIntegration)(
  "Slice 8 exit criteria: Survey Response never creates VOC (#190)",
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
      const requests = `select id from task_request.task_requests where workspace_id=$1 and primary_managed_system_id in (${systems})`;
      // Reverse-FK order: append-only audit/link rows, execution rows, evidence,
      // response rows, then fixture actors and their Managed System.
      await migrateHandle.pool.query(
        `delete from core.audit_log where workspace_id=$1 and (subject_id in (${responses}) or subject_id in (${findings}) or subject_id in (${requests}) or actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2))`,
        [WORKSPACE_ID, `${SLUG}-%`],
      );
      await migrateHandle.pool.query(
        `delete from core.entity_links where workspace_id=$1 and (source_id in (${responses}) or source_id in (${findings}) or target_id in (${findings}) or target_id in (${requests}))`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from task_request.task_requests where id in (${requests})`,
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        "delete from finding.evidence_highlights where finding_id in (" +
          findings +
          ")",
        [WORKSPACE_ID, `${SLUG}%`],
      );
      await migrateHandle.pool.query(
        `delete from finding.findings where id in (${findings})`,
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
        `delete from voc.vocs where primary_managed_system_id in (${systems})`,
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
    async function seed(): Promise<Source> {
      const msId = await insertMsDirectly(
        migrateHandle,
        WORKSPACE_ID,
        uid(SLUG),
        "Slice 8 Survey MS",
      );
      const survey = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'outcome','open',$3,$4,$5,true,$5,now()) returning id`,
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
        [
          WORKSPACE_ID,
          surveyId,
          responseId,
          questionId,
          JSON.stringify("raw private Slice 8 answer"),
        ],
      );
      return { msId, surveyId, questionId, responseId };
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
    async function vocCount(): Promise<number> {
      const count = await migrateHandle.pool.query<{ count: string }>(
        "select count(*)::text as count from voc.vocs where workspace_id=$1",
        [WORKSPACE_ID],
      );
      return Number(count.rows[0]?.count ?? 0);
    }

    it("returns the route-miss 404 for admin, operator, personal-cap, basic, and no-permission actors", async () => {
      const source = await seed();
      const operator = await actor("operator");
      const personal = await actor("personal");
      const basic = await actor("basic");
      const none = await actor("none");
      await grant(operator.id, "survey.manage", source.msId);
      await grant(personal.id, "survey.read", source.msId);
      await grant(personal.id, "survey.read_personal_responses", source.msId);
      await grant(basic.id, "survey.read", source.msId);
      const before = await vocCount();
      for (const cookie of [
        adminCookie,
        operator.cookie,
        personal.cookie,
        basic.cookie,
        none.cookie,
      ]) {
        const response = await app.inject({
          method: "POST",
          url: `/survey-responses/${source.responseId}/create-voc`,
          headers: headers(cookie),
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({
          statusCode: 404,
          error: "Not Found",
        });
        expect(response.body).not.toContain("create_voc");
      }
      expect(await vocCount()).toBe(before);
    });

    it("rejects every conversion-semantic Survey Response -> VOC registry tuple at the generic route without a row", async () => {
      const source = await seed();
      const target = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        source.msId,
        adminId,
        "Slice 8 forbidden VOC target",
      );
      const relationTypes = [
        "created_finding",
        "generated_finding",
        "converted_to",
      ] as const;
      for (const relation_type of relationTypes) {
        const before = await migrateHandle.pool.query<{ count: string }>(
          "select count(*)::text as count from core.entity_links where workspace_id=$1",
          [WORKSPACE_ID],
        );
        const response = await app.inject({
          method: "POST",
          url: "/entity-links",
          headers: headers(adminCookie, true),
          payload: {
            source: { type: "survey_response", id: source.responseId },
            target: { type: "voc", id: target.id },
            relation_type,
          },
        });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
          code: "validation.failed",
          message: "unsupported entity link tuple",
          detail: { fields: [{ path: [], code: "unsupported_tuple" }] },
        });
        const after = await migrateHandle.pool.query<{ count: string }>(
          "select count(*)::text as count from core.entity_links where workspace_id=$1",
          [WORKSPACE_ID],
        );
        expect(after.rows).toEqual(before.rows);
      }
    });

    it("keeps VOC count fixed through the permitted Finding -> Task Request path and excludes create_voc from every results payload", async () => {
      expectTypeOf<SurveyResultNextAction["id"]>().toEqualTypeOf<
        "create_finding" | "request_task"
      >();
      const source = await seed();
      const creator = await actor("creator");
      const reader = await actor("reader");
      for (const capability of [
        "survey.read",
        "survey.read_personal_responses",
        "survey.manage",
        "finding.manage",
        "finding.read",
      ])
        await grant(creator.id, capability, source.msId);
      await grant(reader.id, "survey.read", source.msId);
      const before = await vocCount();
      const created = await app.inject({
        method: "POST",
        url: `/survey-responses/${source.responseId}/create-finding`,
        headers: headers(creator.cookie, true),
        payload: { severity: "medium", approved_excerpt_ids: [] },
      });
      expect(created.statusCode).toBe(201);
      const findingId = created.json<{ id: string }>().id;
      expect(await vocCount()).toBe(before);
      const requested = await app.inject({
        method: "POST",
        url: `/findings/${findingId}/request-task`,
        headers: headers(creator.cookie, true),
        payload: {
          evidence_summary: "Survey evidence remains a Finding source",
          requested_outcome: "Review in the task queue",
        },
      });
      expect(requested.statusCode).toBe(201);
      expect(await vocCount()).toBe(before);
      const audits = await migrateHandle.pool.query<{ event_type: string }>(
        "select event_type from core.audit_log where subject_id=$1 or detail->>'source_survey_response_id'=$2",
        [findingId, source.responseId],
      );
      expect(audits.rows.map((row) => row.event_type)).toEqual(
        expect.arrayContaining([
          "finding_created_from_survey_response",
          "task_request_created_from_finding",
        ]),
      );
      for (const cookie of [creator.cookie, reader.cookie, adminCookie]) {
        const results = await app.inject({
          method: "GET",
          url: `/surveys/${source.surveyId}/results`,
          headers: headers(cookie),
        });
        expect(results.statusCode).toBe(200);
        const body = surveyResultDtoSchema.parse(results.json());
        expect(
          new Set<string>(body.next_actions.map((action) => action.id)).has(
            "create_voc",
          ),
        ).toBe(false);
      }
    });
  },
);
