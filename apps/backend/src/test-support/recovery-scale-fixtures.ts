import { createHash } from 'node:crypto';
import type { DbHandle } from '../db/client.js';
import { insertActorRow } from './actor-fixtures.js';
import { insertMsDirectly } from './core-fixtures.js';
import { insertFindingRow } from './findings-fixtures.js';
import { grantCapability, insertPermissionRequestRow } from './permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from './recovery-fixtures.js';
import { insertTaskRow } from './task-fixtures.js';
import { insertVocDirectly } from './voc-fixtures.js';

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Missing recovery scale fixture');
  return value;
}

export const SCALE_PREFIX = 'recovery-scale-1094';
export const SCALE_CAPABILITIES = [
  'voc.read',
  'voc.triage',
  'finding.read',
  'finding.manage',
  'survey.read',
  'survey.read_personal_responses',
] as const;
export const scaleId = (label: string) => {
  const hex = createHash('md5').update(`${SCALE_PREFIX}:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export type ScaleActor = { id: string; externalId: string; systems: string[] };
export type ScaleFixture = Awaited<ReturnType<typeof seedRecoveryScale>>;

/** Logical manifest and row ordering are identical across reset baseline/candidate runs. */
export async function seedRecoveryScale(db: DbHandle, workspaceId: string) {
  const systems: string[] = [];
  const actors: ScaleActor[] = [];
  for (const [label, roleLevel] of [
    ['admin', 'admin'],
    ['one', 'developer'],
    ['several', 'developer'],
  ] as const) {
    const externalId = `${SCALE_PREFIX}-${label}`;
    const actor = await insertActorRow(db, { workspaceId, externalId, roleLevel });
    const id = scaleId(`actor-${label}`);
    await db.pool.query('update core.actors set id=$2::uuid where id=$1', [actor.id, id]);
    actors.push({ id, externalId, systems: [] });
  }
  const admin = required(actors[0]);
  const respondents: string[] = [];
  const thresholdResult = await db.pool.query<{ threshold: number }>(
    'select coalesce(max(survey_anonymity_threshold),5)::int as threshold from core.workspace_settings where workspace_id=$1',
    [workspaceId],
  );
  const threshold = Math.max(1, required(thresholdResult.rows[0]).threshold);
  for (let n = 0; n < threshold; n++) {
    const actor = await insertActorRow(db, {
      workspaceId,
      externalId: `${SCALE_PREFIX}-respondent-${n}`,
      roleLevel: 'user',
    });
    const id = scaleId(`respondent-${n}`);
    await db.pool.query('update core.actors set id=$2::uuid where id=$1', [actor.id, id]);
    respondents.push(id);
  }
  const manifest = [];
  for (let s = 0; s < 4; s++) {
    const insertedSystem = await insertMsDirectly(
      db,
      workspaceId,
      `${SCALE_PREFIX}-${s}`,
      `Recovery Scale ${s}`,
    );
    const system = scaleId(`system-${s}`);
    await db.pool.query('update core.managed_systems set id=$2::uuid where id=$1', [
      insertedSystem,
      system,
    ]);
    systems.push(system);
    // Public helpers establish canonical shapes; clones use bound SQL arrays, not Drizzle interpolation.
    const voc = await insertVocDirectly(
      db,
      workspaceId,
      system,
      admin.id,
      `${SCALE_PREFIX}-voc-${s}-0`,
      { severity: 'high' },
    );
    await db.pool.query('update voc.vocs set id=$2::uuid where id=$1', [
      voc.id,
      scaleId(`voc-${s}-0`),
    ]);
    await db.pool.query(
      `insert into voc.vocs (id,workspace_id,primary_managed_system_id,reporter_id,display_id,title,description_rich_content,source_context,reporter_facing_status,triage_state,severity)
       select md5($2 || ':voc-' || $3::text || '-' || n)::uuid,v.workspace_id,v.primary_managed_system_id,v.reporter_id,
       $2 || '-VOC-' || $3::text || '-' || n,$2 || '-voc-' || $3::text || '-' || n,v.description_rich_content,v.source_context,v.reporter_facing_status,v.triage_state,v.severity
       from voc.vocs v cross join generate_series(1,1249) n where v.id=$1`,
      [scaleId(`voc-${s}-0`), SCALE_PREFIX, s],
    );
    const task = await insertTaskRow(db, {
      workspaceId,
      primaryManagedSystemId: system,
      createdBy: admin.id,
      status: 'released',
    });
    await db.pool.query('update task.tasks set id=$2::uuid where id=$1', [
      task.id,
      scaleId(`task-${s}-0`),
    ]);
    await db.pool.query(
      `insert into task.tasks (id,workspace_id,primary_managed_system_id,display_id,title,status,priority,created_by)
       select md5($2 || ':task-' || $3::text || '-' || n)::uuid,t.workspace_id,t.primary_managed_system_id,
       $2 || '-Task-' || $3::text || '-' || n,t.title,t.status,t.priority,t.created_by
       from task.tasks t cross join generate_series(1,1249) n where t.id=$1`,
      [scaleId(`task-${s}-0`), SCALE_PREFIX, s],
    );
    // 250 released Tasks: 25 disjoint VOCs each fan out to ten Tasks in every System.
    for (let n = 0; n < 250; n++) {
      await link(
        db,
        workspaceId,
        system,
        admin.id,
        scaleId(`voc-${s}-${Math.floor(n / 10)}`),
        'task',
        scaleId(`task-${s}-${n}`),
      );
    }
    for (let n = 0; n < 80; n++) {
      const finding = await insertFindingRow(db, {
        workspaceId,
        primaryManagedSystemId: system,
        createdBy: admin.id,
        sourceId: scaleId(`voc-${s}-${300 + n * 10}`),
        status: 'active',
        evidenceCount: 10,
        title: `${SCALE_PREFIX}-finding-${s}-${n}`,
      });
      await db.pool.query('update finding.findings set id=$2::uuid where id=$1', [
        finding.id,
        scaleId(`finding-${s}-${n}`),
      ]);
      for (let v = 0; v < 10; v++) {
        await link(
          db,
          workspaceId,
          system,
          admin.id,
          scaleId(`voc-${s}-${300 + n * 10 + v}`),
          'finding',
          scaleId(`finding-${s}-${n}`),
        );
      }
      const surveyId = scaleId(`survey-${s}-${n}`);
      const questionId = scaleId(`question-${s}-${n}`);
      await db.pool.query(
        `insert into survey.surveys (id,workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at,closed_at)
         values ($1,$2,$3,'outcome','closed',$3,$4,$5,true,$5,now(),now())`,
        [surveyId, workspaceId, `${SCALE_PREFIX}-SRV-${s}-${n}`, system, admin.id],
      );
      await db.pool.query(
        `insert into survey.survey_questions (id,workspace_id,survey_id,kind,prompt,is_required,rating_min,rating_max,sort_order,branch_depth)
         values ($1,$2,$3,'rating','Outcome',false,1,5,0,0)`,
        [questionId, workspaceId, surveyId],
      );
      for (let r = 0; r < respondents.length; r++) {
        const responseId = scaleId(`response-${s}-${n}-${r}`);
        await db.pool.query(
          'insert into survey.survey_responses (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,$4,true,now())',
          [responseId, workspaceId, surveyId, respondents[r]],
        );
        await db.pool.query(
          "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,'rating','1'::jsonb)",
          [workspaceId, surveyId, responseId, questionId],
        );
      }
    }
    manifest.push({
      label: `system-${s}`,
      id: system,
      vocs: 1250,
      tasks: 1250,
      activeFindings: 80,
      badOutcomeSurveys: 80,
      releasedLinkedTasks: 250,
    });
  }
  admin.systems = [...systems];
  required(actors[1]).systems = systems.slice(0, 1);
  required(actors[2]).systems = systems.slice(0, 3);
  for (const actor of actors.slice(1)) {
    for (const system of actor.systems) {
      for (const capability of SCALE_CAPABILITIES) {
        await grantCapability(db, workspaceId, actor.id, capability, system, admin.id);
      }
    }
  }
  for (let n = 0; n < 80; n++) {
    const requester = await insertActorRow(db, {
      workspaceId,
      externalId: `${SCALE_PREFIX}-requester-${n}`,
      roleLevel: 'user',
    });
    const requesterId = scaleId(`requester-${n}`);
    await db.pool.query('update core.actors set id=$2::uuid where id=$1', [
      requester.id,
      requesterId,
    ]);
    const request = await insertPermissionRequestRow(db, {
      workspaceId,
      requesterActorId: requesterId,
      requestedCapability: 'voc.read',
      requestedManagedSystemId: required(systems[n % 4]),
      reason: `${SCALE_PREFIX}-${n}`,
    });
    await db.pool.query('update permission.permission_requests set id=$2::uuid where id=$1', [
      request.id,
      scaleId(`request-${n}`),
    ]);
  }
  return {
    systems,
    actors,
    manifest,
    threshold,
    totals: { vocs: 5000, tasks: 5000, findings: 320, surveys: 320, permissionRequests: 80 },
  };
}

async function link(
  db: DbHandle,
  workspace: string,
  system: string,
  actor: string,
  voc: string,
  targetType: string,
  target: string,
) {
  await db.pool.query(
    `insert into core.entity_links (workspace_id,source_type,source_id,target_type,target_id,relation_type,managed_system_id,created_by)
     values ($1,'voc',$2,$3,$4,'evidence_of',$5,$6)`,
    [workspace, voc, targetType, target, system, actor],
  );
}

/** Also handles a partially seeded cohort. Never deletes other suites' actors/buckets. */
export async function cleanupRecoveryScale(db: DbHandle, workspaceId: string) {
  const systems = 'select id from core.managed_systems where workspace_id=$1 and slug like $2';
  const actors = 'select id from core.actors where workspace_id=$1 and external_id like $2';
  const args = [workspaceId, `${SCALE_PREFIX}%`];
  // Workspace-level permission identities cannot be selected by Managed System.
  for (const table of ['recovery_history', 'recovery_presentations', 'recovery_identities']) {
    await db.pool.query(
      `delete from dashboard.${table} where workspace_id=$1 and recovery_item_id in
      (select recovery_item_id from dashboard.recovery_identities where workspace_id=$1 and source_id in
      (select id from permission.permission_requests where requester_actor_id in (${actors})))`,
      args,
    );
  }
  await db.pool.query(
    `delete from core.entity_links where managed_system_id in (${systems})`,
    args,
  );
  for (const table of [
    'survey_response_answers',
    'survey_responses',
    'survey_questions',
    'surveys',
  ]) {
    const predicate =
      table === 'surveys'
        ? `primary_managed_system_id in (${systems})`
        : `survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`;
    await db.pool.query(`delete from survey.${table} where ${predicate}`, args);
  }
  await db.pool.query(
    `delete from task.tasks where primary_managed_system_id in (${systems})`,
    args,
  );
  await db.pool.query(
    `delete from finding.findings where primary_managed_system_id in (${systems})`,
    args,
  );
  await db.pool.query(`delete from voc.vocs where primary_managed_system_id in (${systems})`, args);
  for (const table of ['permission_grants', 'permission_denies']) {
    await db.pool.query(`delete from permission.${table} where actor_id in (${actors})`, args);
  }
  await db.pool.query(
    `delete from permission.permission_requests where requester_actor_id in (${actors})`,
    args,
  );
  await deleteRecoveryFixtureParents(
    db,
    'delete from core.managed_systems where workspace_id=$1 and slug like $2',
    args,
  );
  for (const table of ['notifications', 'audit_log', 'idempotency_keys', 'sessions']) {
    await db.pool.query(`delete from core.${table} where actor_id in (${actors})`, args);
  }
  await db.pool.query(
    "delete from core.rate_limits where split_part(key,':',2) in (select id::text from core.actors where workspace_id=$1 and external_id like $2)",
    args,
  );
  await db.pool.query(
    'delete from core.actors where workspace_id=$1 and external_id like $2',
    args,
  );
}
