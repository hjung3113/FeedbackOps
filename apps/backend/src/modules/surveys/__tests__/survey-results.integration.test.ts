import { randomUUID } from "node:crypto";

import { surveyResultDtoSchema } from "@fops/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config.js";
import { type DbHandle, createDb } from "../../../db/client.js";
import { buildServer } from "../../../server.js";
import {
  SESSION_COOKIE_NAME,
  insertMsDirectly,
  loginAs,
  uid,
} from "../../voc/__tests__/_seed-helpers.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG = "it-survey-results";

describe.skipIf(!runIntegration)("survey result read route (#186)", () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, "mock-admin-1");
  });
  beforeEach(async () => cleanup());
  afterAll(async () => {
    await cleanup();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup() {
    if (!migrateHandle) return;
    const managedSystems =
      "select id from core.managed_systems where workspace_id=$1 and slug like $2";
    const surveys = `select id from survey.surveys where workspace_id=$1 and primary_managed_system_id in (${managedSystems})`;
    await migrateHandle.pool.query(
      `delete from core.audit_log where subject_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_responses where survey_id in (${surveys})`,
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
      `delete from core.actors where workspace_id=$1 and external_id like $2`,
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id=$1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
  }

  async function seed(
    responseCount: number,
    status: "draft" | "open" | "closed" = "open",
  ) {
    const ms = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG),
      "Results MS",
    );
    const actor = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by)
       values ($1,$2,'validation',$3,$4,$5,$6,true,$6) returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        status,
        `${SLUG} survey`,
        ms,
        actor.rows[0]?.id,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error("survey seed failed");
    const questions = await migrateHandle.pool.query<{
      id: string;
      kind: string;
    }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,sort_order,branch_depth)
       values ($1,$2,'single_choice','Choice',true,'[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]',null,null,0,0),
              ($1,$2,'rating','Rating',true,null,1,5,1,0),
              ($1,$2,'text','Text',true,null,null,null,2,0) returning id,kind`,
      [WORKSPACE_ID, surveyId],
    );
    for (let i = 0; i < responseCount; i += 1) {
      const responseId = randomUUID();
      const respondent = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type)
         values ($1,$2,$3,'Results respondent','user','internal_member') returning id`,
        [
          WORKSPACE_ID,
          `${SLUG}-${responseId}`,
          `${SLUG}-${responseId}@example.test`,
        ],
      );
      await migrateHandle.pool.query(
        `insert into survey.survey_responses (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
         values ($1,$2,$3,$4,true,now())`,
        [responseId, WORKSPACE_ID, surveyId, respondent.rows[0]?.id],
      );
      // Fixture insertion uses the privileged migrate handle; the route itself only calls 0038 functions.
      await migrateHandle.pool.query(
        `insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value)
         values ($1,$2,$3,$4,'single_choice','"yes"'),($1,$2,$3,$5,'rating','3'),($1,$2,$3,$6,'text','"secret text"')`,
        [
          WORKSPACE_ID,
          surveyId,
          responseId,
          questions.rows[0]?.id,
          questions.rows[1]?.id,
          questions.rows[2]?.id,
        ],
      );
    }
    return surveyId;
  }

  function get(surveyId: string, suffix = "") {
    return app.inject({
      method: "GET",
      url: `/surveys/${surveyId}/results${suffix}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
  }
  function assertNoForbidden(value: unknown) {
    const forbidden =
      /^(respondent.*|actor_id|email|external_id|response_id|submitted_at|created_at|session.*|ip.*|user_agent|answer_value|text|excerpt)$/;
    if (Array.isArray(value)) return value.forEach(assertNoForbidden);
    if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(forbidden);
        assertNoForbidden(child);
      }
  }

  it("suppresses 0 through 4 and exposes safe summaries at 5 without an audit write", async () => {
    const hiddenId = await seed(4);
    const before = await migrateHandle.pool.query<{ count: string }>(
      "select count(*) from core.audit_log where workspace_id=$1",
      [WORKSPACE_ID],
    );
    const hidden = await get(hiddenId);
    expect(hidden.statusCode).toBe(200);
    const hiddenBody = hidden.json();
    expect(
      hiddenBody.questions.every(
        (question: { visibility: string }) =>
          question.visibility === "suppressed",
      ),
    ).toBe(true);
    expect(hiddenBody.next_actions).toEqual([]);
    assertNoForbidden(hiddenBody);
    const visibleId = await seed(5);
    const visible = await get(visibleId);
    expect(visible.statusCode).toBe(200);
    const body = surveyResultDtoSchema.parse(visible.json());
    expect(body.questions.map((question) => question.visibility)).toEqual([
      "visible",
      "visible",
      "visible",
    ]);
    expect(body.next_actions).toEqual([]);
    assertNoForbidden(body);
    const after = await migrateHandle.pool.query<{ count: string }>(
      "select count(*) from core.audit_log where workspace_id=$1",
      [WORKSPACE_ID],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("rejects draft results and any query parameter", async () => {
    const draft = await seed(0, "draft");
    expect((await get(draft)).statusCode).toBe(409);
    const open = await seed(5);
    const response = await get(open, "?segment=internal");
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("validation.failed");
  });
});
