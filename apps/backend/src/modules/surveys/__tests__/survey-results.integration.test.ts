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
type Answer = {
  choice?: string;
  multi?: string[];
  rating?: number;
  text?: string;
};
type SeededSurvey = {
  id: string;
  msId: string;
  questions: Record<string, string>;
};

describe.skipIf(!runIntegration)("survey result read route (#186)", () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, "mock-admin-1");
    userCookie = await loginAs(app, "mock-user-1");
    const r = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = r.rows[0]?.id ?? "";
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
    const systems =
      "select id from core.managed_systems where workspace_id=$1 and slug like $2";
    const surveys = `select id from survey.surveys where workspace_id=$1 and primary_managed_system_id in (${systems})`;
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
      `delete from permission.permission_grants where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_denies where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      "delete from permission.permission_grants where workspace_id=$1 and actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)",
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      "delete from permission.permission_denies where workspace_id=$1 and actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)",
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
      "delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'",
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id=$1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
  }

  async function seed(
    answers: Answer[],
    options: {
      status?: "draft" | "open" | "closed";
      identityProtected?: boolean;
    } = {},
  ): Promise<SeededSurvey> {
    const status = options.status ?? "open";
    const msId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG),
      "Results MS",
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at,closed_at)
       values ($1,$2,'validation',$3,$4,$5,$6,$7,$6,
               case when $3 in ('open','closed') then now() else null end,
               case when $3='closed' then now() else null end) returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        status,
        `${SLUG} survey`,
        msId,
        adminId,
        options.identityProtected ?? true,
      ],
    );
    const id = survey.rows[0]?.id;
    if (!id) throw new Error("survey seed failed");
    const rows = await migrateHandle.pool.query<{ id: string; kind: string }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,sort_order,branch_depth)
       values ($1,$2,'single_choice','Choice',false,'[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]',null,null,0,0),
              ($1,$2,'multiple_choice','Multiple',false,'[{"key":"a","label":"A"},{"key":"b","label":"B"}]',null,null,1,0),
              ($1,$2,'rating','Rating',false,null,1,5,2,0),
              ($1,$2,'text','Text',false,null,null,null,3,0) returning id,kind`,
      [WORKSPACE_ID, id],
    );
    const questions = Object.fromEntries(
      rows.rows.map((row) => [row.kind, row.id]),
    );
    for (const answer of answers) {
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
        "insert into survey.survey_responses (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,$4,true,now())",
        [responseId, WORKSPACE_ID, id, respondent.rows[0]?.id],
      );
      const add = async (kind: string, question: string, value: unknown) =>
        migrateHandle.pool.query(
          "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,$5,$6::jsonb)",
          [WORKSPACE_ID, id, responseId, question, kind, JSON.stringify(value)],
        );
      if (answer.choice !== undefined)
        await add("single_choice", questions.single_choice!, answer.choice);
      if (answer.multi !== undefined)
        await add("multiple_choice", questions.multiple_choice!, answer.multi);
      if (answer.rating !== undefined)
        await add("rating", questions.rating!, answer.rating);
      if (answer.text !== undefined)
        await add("text", questions.text!, answer.text);
    }
    return { id, msId, questions };
  }

  async function dev() {
    const externalId = `${SLUG}-developer-${randomUUID()}`;
    const row = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Results developer','developer','internal_member') returning id",
      [WORKSPACE_ID, externalId, `${externalId}@example.test`],
    );
    return {
      id: row.rows[0]?.id ?? "",
      cookie: await loginAs(app, externalId),
    };
  }
  async function grant(actorId: string, capability: string, msId: string) {
    await migrateHandle.pool.query(
      "insert into permission.permission_grants (workspace_id,actor_id,capability,managed_system_id,granted_by_actor_id) values ($1,$2,$3,$4,$5)",
      [WORKSPACE_ID, actorId, capability, msId, adminId],
    );
  }
  async function deny(actorId: string, capability: string, msId: string) {
    await migrateHandle.pool.query(
      "insert into permission.permission_denies (workspace_id,actor_id,capability,managed_system_id,reason,created_by_actor_id) values ($1,$2,$3,$4,'test deny',$5)",
      [WORKSPACE_ID, actorId, capability, msId, adminId],
    );
  }
  function get(id: string, cookie = adminCookie, suffix = "") {
    return app.inject({
      method: "GET",
      url: `/surveys/${id}/results${suffix}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
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
  function parse2xx(response: { statusCode: number; json: () => unknown }) {
    expect(response.statusCode).toBe(200);
    const body = surveyResultDtoSchema.parse(response.json());
    expect(body.next_actions).toEqual([]);
    assertNoForbidden(body);
    return body;
  }
  const full = (count: number): Answer[] =>
    Array.from({ length: count }, () => ({
      choice: "yes",
      multi: ["a"],
      rating: 3,
      text: "private body",
    }));

  it("enforces the actor matrix and parses every successful result", async () => {
    const survey = await seed(full(4));
    const adminThreshold = parse2xx(await get(survey.id));
    expect(adminThreshold.questions).toEqual(
      adminThreshold.questions.map((q) => ({
        question_id: q.question_id,
        visibility: "suppressed",
        response_count: null,
        suppression: { code: "anonymity_threshold" },
      })),
    );
    await grant(adminId, "survey.read_personal_responses", survey.msId);
    const adminExact = parse2xx(await get(survey.id));
    expect(adminExact.questions.map((q) => q.visibility)).toEqual([
      "visible",
      "visible",
      "visible",
      "visible",
    ]);
    expect(adminExact.questions[2]).toMatchObject({
      answer_count: 4,
      distribution: { low: 0, mid: 4, high: 0 },
    });
    const actor = await dev();
    expect((await get(survey.id, actor.cookie)).statusCode).toBe(404);
    await grant(actor.id, "survey.read", survey.msId);
    expect(
      parse2xx(await get(survey.id, actor.cookie)).questions.every(
        (q) => q.visibility === "suppressed",
      ),
    ).toBe(true);
    await grant(actor.id, "survey.read_personal_responses", survey.msId);
    expect(
      parse2xx(await get(survey.id, actor.cookie)).questions.map(
        (q) => q.visibility,
      ),
    ).toEqual(["visible", "visible", "visible", "visible"]);
    await deny(actor.id, "survey.read", survey.msId);
    expect((await get(survey.id, actor.cookie)).statusCode).toBe(404);
    expect((await get(survey.id, userCookie)).statusCode).toBe(404);
  });

  it("makes cohorts 0 through 4 byte-identical and exposes 5 and 6", async () => {
    const hidden = await Promise.all(
      [0, 1, 4].map(async (count) =>
        parse2xx(await get((await seed(full(count))).id)),
      ),
    );
    const safeQuestionBytes = (body: (typeof hidden)[number]) =>
      body.questions.map(({ question_id: _questionId, ...question }) =>
        JSON.stringify(question),
      );
    for (const body of hidden)
      expect(safeQuestionBytes(body)).toEqual(safeQuestionBytes(hidden[0]!));
    for (const count of [5, 6]) {
      const body = parse2xx(await get((await seed(full(count))).id));
      expect(body.questions.map((q) => q.visibility)).toEqual([
        "visible",
        "visible",
        "visible",
        "visible",
      ]);
    }
  });

  it("applies low bucket suppression, exact overlapping choice buckets, rating partition, and text masking", async () => {
    const one = await seed([
      ...full(4),
      { choice: "no", multi: ["a", "b"], rating: 6, text: "private" },
    ]);
    const noGrant = parse2xx(await get(one.id));
    expect(noGrant.questions.map((q) => q.visibility)).toEqual([
      "suppressed",
      "suppressed",
      "suppressed",
      "visible",
    ]);
    await grant(adminId, "survey.read_personal_responses", one.msId);
    const exact = parse2xx(await get(one.id));
    expect(exact.questions.map((q) => q.question_id)).toEqual([
      one.questions.single_choice,
      one.questions.multiple_choice,
      one.questions.rating,
      one.questions.text,
    ]);
    expect(exact.questions[0]).toMatchObject({
      answer_count: 5,
      option_buckets: [
        { key: "yes", count: 4 },
        { key: "no", count: 1 },
      ],
    });
    expect(exact.questions[1]).toMatchObject({
      answer_count: 5,
      option_buckets: [
        { key: "a", count: 5 },
        { key: "b", count: 1 },
      ],
    });
    expect(exact.questions[2]).toMatchObject({
      answer_count: 5,
      distribution: { low: 0, mid: 4, high: 0 },
    });
    expect(exact.questions[3]).toMatchObject({
      answer_count: 5,
      distribution: null,
      excerpts: [],
    });
    const four = await seed([
      ...full(1),
      ...Array.from({ length: 4 }, () => ({
        choice: "no",
        multi: ["a"],
        rating: 3,
      })),
    ]);
    const fourBody = parse2xx(await get(four.id));
    expect(fourBody.questions[0]?.visibility).toBe("suppressed");
    const zero = await seed(
      Array.from({ length: 5 }, () => ({
        choice: "yes",
        multi: ["a"],
        rating: 3,
      })),
    );
    const zeroBody = parse2xx(await get(zero.id));
    expect(zeroBody.questions[0]).toMatchObject({
      visibility: "visible",
      option_buckets: [
        { key: "yes", count: 5 },
        { key: "no", count: 0 },
      ],
    });
    expect(zeroBody.questions[3]).toMatchObject({
      visibility: "visible",
      answer_count: 0,
      excerpts: [],
    });
    const oneText = await seed([
      ...Array.from({ length: 4 }, () => ({
        choice: "yes",
        multi: ["a"],
        rating: 3,
      })),
      { choice: "yes", multi: ["a"], rating: 3, text: "private" },
    ]);
    expect(parse2xx(await get(oneText.id)).questions[3]?.visibility).toBe(
      "suppressed",
    );
    const fourText = await seed([
      ...Array.from({ length: 4 }, () => ({
        choice: "yes",
        multi: ["a"],
        rating: 3,
        text: "private",
      })),
      { choice: "yes", multi: ["a"], rating: 3 },
    ]);
    expect(parse2xx(await get(fourText.id)).questions[3]?.visibility).toBe(
      "suppressed",
    );
  });

  it("serves closed results, preserves identity protection, rejects draft/query/cross-workspace, and writes no audit", async () => {
    const before = await migrateHandle.pool.query<{ count: string }>(
      "select count(*) from core.audit_log where workspace_id=$1",
      [WORKSPACE_ID],
    );
    const closed = await seed(full(5), {
      status: "closed",
      identityProtected: false,
    });
    expect(parse2xx(await get(closed.id)).identity_protected).toBe(false);
    const protectedSurvey = await seed(full(5), { identityProtected: true });
    expect(parse2xx(await get(protectedSurvey.id)).identity_protected).toBe(
      true,
    );
    const draft = await seed([], { status: "draft" });
    const draftResponse = await get(draft.id);
    expect(draftResponse.statusCode).toBe(409);
    expect(draftResponse.json()).toMatchObject({
      error: { code: "conflict.survey_results_unavailable" },
    });
    const invalidQuery = await get(closed.id, adminCookie, "?segment=internal");
    expect(invalidQuery.statusCode).toBe(422);
    expect(invalidQuery.json()).toMatchObject({
      error: { code: "validation.failed" },
    });
    const foreignWorkspace = randomUUID();
    await migrateHandle.pool.query(
      "insert into core.workspaces (id,name) values ($1,$2)",
      [foreignWorkspace, `${SLUG} foreign`],
    );
    const foreignActor = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Foreign admin','admin','internal_member') returning id",
      [
        foreignWorkspace,
        `${SLUG}-foreign-${foreignWorkspace}`,
        `foreign-${foreignWorkspace}@example.test`,
      ],
    );
    const foreignMs = await insertMsDirectly(
      migrateHandle,
      foreignWorkspace,
      uid(`${SLUG}-foreign`),
      "Foreign results MS",
    );
    const foreignSurvey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'validation','open',$3,$4,$5,true,$5,now()) returning id`,
      [
        foreignWorkspace,
        `S-${randomUUID()}`,
        `${SLUG} foreign`,
        foreignMs,
        foreignActor.rows[0]?.id,
      ],
    );
    expect(
      (await get(foreignSurvey.rows[0]?.id ?? randomUUID())).statusCode,
    ).toBe(404);
    await migrateHandle.pool.query(
      "delete from survey.surveys where workspace_id=$1",
      [foreignWorkspace],
    );
    await migrateHandle.pool.query(
      "delete from core.actors where workspace_id=$1",
      [foreignWorkspace],
    );
    await migrateHandle.pool.query(
      "delete from core.managed_systems where workspace_id=$1",
      [foreignWorkspace],
    );
    await migrateHandle.pool.query("delete from core.workspaces where id=$1", [
      foreignWorkspace,
    ]);
    const after = await migrateHandle.pool.query<{ count: string }>(
      "select count(*) from core.audit_log where workspace_id=$1",
      [WORKSPACE_ID],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
