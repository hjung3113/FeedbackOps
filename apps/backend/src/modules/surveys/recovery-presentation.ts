import { createHash } from 'node:crypto';
import type { RecoveryPresentationPatch } from '@fops/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { lockRecoveryCommand, requireRecoveryCommandLock } from '../../db/recovery-command-lock.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { recoveryHistoryWindowStart } from '../dashboard/history-window.js';
import { lockFindingRecoverySubjects } from '../findings/recovery-read.js';
import { checkSurveyPersonalResponseRead, checkSurveyRead } from './authorization.js';
import { resolveSurveyResponseEvidenceAccess } from './evidence-access.js';
import { findSurvey } from './repo-read.js';
import { readOutcomeFollowUpState } from './repo-results.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

export type OutcomeRecoveryCapture = {
  workspaceId: string;
  responseId: string;
  surveyId: string;
  state: 'active' | 'resolved' | 'withdrawn';
};
async function state(tx: Tx, workspaceId: string, responseId: string) {
  const current = await readOutcomeFollowUpState(tx, workspaceId, responseId);
  if (
    !current ||
    !current.is_outcome ||
    !current.is_poor ||
    !current.meets_threshold ||
    current.survey_status !== 'closed'
  )
    return 'withdrawn' as const;
  return current.resolution === 'open' ? ('active' as const) : ('resolved' as const);
}
/** Private recorder seam. It discloses nothing; public callers must cross the personal gate. */
export async function captureOutcomeRecovery(
  tx: Tx,
  workspaceId: string,
  responseId: string,
  surveyId: string,
): Promise<OutcomeRecoveryCapture> {
  await requireRecoveryCommandLock(tx, workspaceId);
  // Response evidence lock follows workspace command serialization.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${responseId}::text,0))`);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}),hashtext(${`outcome:${responseId}`}))`,
  );
  return { workspaceId, responseId, surveyId, state: await state(tx, workspaceId, responseId) };
}
export async function finishOutcomeRecovery(
  tx: Tx,
  captured: OutcomeRecoveryCapture,
  actorId: string | null,
  action: string | null,
  evidence: 'command' | 'observation' = 'command',
) {
  const next = await state(tx, captured.workspaceId, captured.responseId);
  if (next === captured.state) return;
  if (next === 'active' || captured.state === 'active')
    await tx.execute(sql`INSERT INTO survey.outcome_recovery_identities
    (workspace_id,outcome_recovery_item_id,category,source_id,occurrence,state)
    VALUES (${captured.workspaceId}::uuid,${captured.responseId},'bad-outcome-response-no-followup',${captured.responseId}::uuid,1,'active')
    ON CONFLICT (workspace_id,outcome_recovery_item_id) DO NOTHING`);
  const stored = (
    await tx.execute<{
      occurrence: number;
      state: string;
    }>(sql`SELECT occurrence,state FROM survey.outcome_recovery_identities
    WHERE workspace_id=${captured.workspaceId}::uuid AND outcome_recovery_item_id=${captured.responseId} FOR UPDATE`)
  ).rows[0];
  if (!stored) return;
  if (evidence === 'command' && captured.state === 'active' && stored.state !== 'active') {
    await tx.execute(sql`UPDATE survey.outcome_recovery_identities SET occurrence=occurrence+1,state='active'
      WHERE workspace_id=${captured.workspaceId}::uuid AND outcome_recovery_item_id=${captured.responseId}`);
    stored.occurrence += 1;
    stored.state = 'active';
  }
  if (stored.state === next) return;
  if (stored.state === 'active' && next !== 'active')
    await tx.execute(sql`INSERT INTO survey.outcome_recovery_history
    (workspace_id,outcome_recovery_item_id,occurrence,resolved_at,outcome,evidence,actor_id,action)
    VALUES (${captured.workspaceId}::uuid,${captured.responseId},${stored.occurrence},clock_timestamp(),${next},${evidence},${actorId}::uuid,${action})
    ON CONFLICT (workspace_id,outcome_recovery_item_id,occurrence) DO NOTHING`);
  await tx.execute(sql`UPDATE survey.outcome_recovery_identities SET state=${next},occurrence=occurrence+${next === 'active' ? 1 : 0},observed_at=clock_timestamp()
    WHERE workspace_id=${captured.workspaceId}::uuid AND outcome_recovery_item_id=${captured.responseId}`);
}
export async function captureFindingOutcomeRecovery(
  tx: Tx,
  workspaceId: string,
  findingId: string,
) {
  await requireRecoveryCommandLock(tx, workspaceId);
  await lockFindingRecoverySubjects(tx, workspaceId, [findingId]);
  const rows = (
    await tx.execute<{ response_id: string; survey_id: string }>(
      sql`SELECT * FROM survey.read_finding_recovery_subjects(${workspaceId}::uuid,${findingId}::uuid)`,
    )
  ).rows;
  const captures: OutcomeRecoveryCapture[] = [];
  for (const row of rows.sort((a, b) =>
    a.response_id < b.response_id ? -1 : a.response_id > b.response_id ? 1 : 0,
  ))
    captures.push(await captureOutcomeRecovery(tx, workspaceId, row.response_id, row.survey_id));
  return captures;
}
export function createOutcomeRecoveryPresentation(deps: SurveysServiceDeps) {
  async function auditPersonalMetadata(
    tx: Tx,
    actor: SurveysActor,
    surveyId: string,
    responseIds: string[],
  ) {
    if (responseIds.length === 0) return;
    const rows = (
      await tx.execute<{ response_id: string; question_id: string }>(sql`
      SELECT DISTINCT response_id,question_id FROM survey.read_outcome_follow_up_items_personal(${actor.workspace_id}::uuid,${surveyId}::uuid)
      WHERE response_id=ANY(${sqlUuidArray(responseIds)})`)
    ).rows;
    if (new Set(rows.map((row) => row.response_id)).size !== new Set(responseIds).size)
      throw new HttpError('not_found.record', 'survey response not found');
    for (const row of rows)
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'survey_response_personal_read',
        subject_type: 'survey_response',
        subject_id: row.response_id,
        summary: 'Survey response recovery metadata read',
        detail: {
          survey_id: surveyId,
          survey_response_id: row.response_id,
          question_id: row.question_id,
        },
      });
  }
  async function patchOutcomeRecoveryPresentation(
    actor: SurveysActor,
    responseId: string,
    input: RecoveryPresentationPatch,
  ) {
    return deps.db.transaction(async (tx) => {
      await lockRecoveryCommand(tx, actor.workspace_id);
      const { subject } = await resolveSurveyResponseEvidenceAccess(
        deps,
        tx,
        actor,
        responseId,
        'personal_read',
      );
      const captured = await captureOutcomeRecovery(
        tx,
        actor.workspace_id,
        responseId,
        subject.survey_id,
      );
      if (input.action !== 'restore' && captured.state !== 'active')
        throw new HttpError('conflict.stale_write', 'response gap is no longer active');
      if (input.action !== 'restore')
        await tx.execute(sql`INSERT INTO survey.outcome_recovery_identities
        (workspace_id,outcome_recovery_item_id,category,source_id,managed_system_id,occurrence,state)
        VALUES (${actor.workspace_id}::uuid,${responseId},'bad-outcome-response-no-followup',${responseId}::uuid,${subject.primary_managed_system_id}::uuid,1,'active')
        ON CONFLICT (workspace_id,outcome_recovery_item_id) DO NOTHING`);
      const identity = (
        await tx.execute<{
          occurrence: number;
          state: string;
        }>(sql`SELECT occurrence,state FROM survey.outcome_recovery_identities
        WHERE workspace_id=${actor.workspace_id}::uuid AND outcome_recovery_item_id=${responseId} FOR UPDATE`)
      ).rows[0];
      if (!identity)
        return {
          response_id: responseId,
          occurrence: null,
          presentation: { state: 'visible', snoozed_until: null },
        };
      if (captured.state === 'active' && identity.state !== 'active') {
        await tx.execute(sql`UPDATE survey.outcome_recovery_identities SET state='active',occurrence=occurrence+1,observed_at=clock_timestamp()
          WHERE workspace_id=${actor.workspace_id}::uuid AND outcome_recovery_item_id=${responseId}`);
        identity.occurrence += 1;
      }
      const presentation =
        input.action === 'mute' ? 'muted' : input.action === 'snooze' ? 'snoozed' : 'visible';
      const until =
        input.action === 'snooze'
          ? sql`now()+${input.days}::int*interval '1 day'`
          : sql`NULL::timestamptz`;
      const row = (
        await tx.execute<{
          state: string;
          snoozed_until: string | null;
        }>(sql`INSERT INTO survey.outcome_recovery_presentations
        (workspace_id,outcome_recovery_item_id,actor_id,occurrence,state,snoozed_until)
        VALUES (${actor.workspace_id}::uuid,${responseId},${actor.actor_id}::uuid,${identity.occurrence},${presentation},${until})
        ON CONFLICT (workspace_id,outcome_recovery_item_id,actor_id,occurrence) DO UPDATE SET state=EXCLUDED.state,snoozed_until=EXCLUDED.snoozed_until
        RETURNING state,to_char(snoozed_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS snoozed_until`)
      ).rows[0];
      return { response_id: responseId, occurrence: identity.occurrence, presentation: row };
    });
  }
  async function getOutcomeRecoveryPresentation(actor: SurveysActor, responseId: string) {
    return deps.db.transaction(async (tx) => {
      const { subject } = await resolveSurveyResponseEvidenceAccess(
        deps,
        tx,
        actor,
        responseId,
        'personal_read',
      );
      const current = await state(tx, actor.workspace_id, responseId);
      const stored = (
        await tx.execute<{
          occurrence: number;
          state: string;
          presentation_state: string;
          snoozed_until: string | null;
        }>(sql`
        SELECT i.occurrence,i.state,
          CASE WHEN p.state='muted' THEN 'muted' WHEN p.state='snoozed' AND p.snoozed_until>now() THEN 'snoozed' ELSE 'visible' END AS presentation_state,
          CASE WHEN p.state='snoozed' AND p.snoozed_until>now() THEN to_char(p.snoozed_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS snoozed_until
        FROM survey.outcome_recovery_identities i LEFT JOIN survey.outcome_recovery_presentations p
          ON p.workspace_id=i.workspace_id AND p.outcome_recovery_item_id=i.outcome_recovery_item_id AND p.occurrence=i.occurrence
          AND p.actor_id=${actor.actor_id}::uuid AND i.state='active'
        WHERE i.workspace_id=${actor.workspace_id}::uuid AND i.outcome_recovery_item_id=${responseId}`)
      ).rows[0];
      await auditPersonalMetadata(tx, actor, subject.survey_id, [responseId]);
      return {
        response_id: responseId,
        state: current,
        occurrence: stored?.state === current ? stored.occurrence : null,
        presentation:
          stored?.state === current
            ? { state: stored.presentation_state, snoozed_until: stored.snoozed_until }
            : { state: 'visible', snoozed_until: null },
      };
    });
  }
  async function listOutcomeRecovery(
    actor: SurveysActor,
    surveyId: string,
    query: { presentation: 'visible' | 'hidden'; limit: number; cursor?: string | undefined },
  ) {
    return deps.db.transaction(async (tx) => {
      const source = await findSurvey(tx, actor.workspace_id, surveyId);
      if (!source || source.type !== 'outcome')
        throw new HttpError('not_found.record', 'survey not found');
      if (
        !(await checkSurveyRead(deps.checkService, actor, source.primary_managed_system_id, { tx }))
          .allow ||
        !(
          await checkSurveyPersonalResponseRead(
            deps.checkService,
            actor,
            source.primary_managed_system_id,
            { tx },
          )
        ).allow
      )
        throw new HttpError('not_found.record', 'survey not found');
      const bind = createHash('sha256')
        .update(
          JSON.stringify({
            actor,
            surveyId,
            system: source.primary_managed_system_id,
            presentation: query.presentation,
          }),
        )
        .digest('hex');
      let after: string | undefined;
      if (query.cursor) {
        try {
          const cursor = z
            .object({ bind: z.string(), id: z.string().uuid() })
            .strict()
            .parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
          if (
            cursor.bind !== bind ||
            Buffer.from(JSON.stringify(cursor)).toString('base64url') !== query.cursor
          )
            throw new Error('cursor');
          after = cursor.id;
        } catch {
          throw new HttpError('validation.failed', 'invalid cursor', {
            fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
          });
        }
      }
      const data = (
        await tx.execute<{
          total: number;
          visible_total: number;
          hidden_total: number;
          items: Array<{
            response_id: string;
            occurrence: number | null;
            presentation: { state: string; snoozed_until: string | null };
          }>;
        }>(sql`
        WITH permitted AS MATERIALIZED (SELECT response_id FROM survey.read_outcome_recovery_sources(${actor.workspace_id}::uuid,${surveyId}::uuid)),
        matched AS MATERIALIZED (
          SELECT r.response_id,CASE WHEN i.state='active' THEN i.occurrence END AS occurrence,
            CASE WHEN p.state='muted' THEN 'muted' WHEN p.state='snoozed' AND p.snoozed_until>now() THEN 'snoozed' ELSE 'visible' END AS presentation_state,
            CASE WHEN p.state='snoozed' AND p.snoozed_until>now() THEN to_char(p.snoozed_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS snoozed_until
          FROM permitted r CROSS JOIN LATERAL survey.read_outcome_follow_up_state(${actor.workspace_id}::uuid,r.response_id) truth
          LEFT JOIN survey.outcome_recovery_identities i ON i.workspace_id=${actor.workspace_id}::uuid AND i.outcome_recovery_item_id=r.response_id::text
          LEFT JOIN survey.outcome_recovery_presentations p ON p.workspace_id=i.workspace_id AND p.outcome_recovery_item_id=i.outcome_recovery_item_id
            AND p.occurrence=i.occurrence AND p.actor_id=${actor.actor_id}::uuid AND i.state='active'
          WHERE truth.is_outcome AND truth.is_poor AND truth.meets_threshold AND truth.survey_status='closed' AND truth.resolution='open'),
        selected AS MATERIALIZED (SELECT * FROM matched WHERE ${query.presentation === 'hidden' ? sql`presentation_state<>'visible'` : sql`presentation_state='visible'`}),
        page AS (SELECT * FROM selected WHERE ${after ? sql`response_id>${after}::uuid` : sql`true`} ORDER BY response_id LIMIT ${query.limit + 1})
        SELECT (SELECT count(*)::int FROM selected) AS total,(SELECT count(*)::int FROM matched WHERE presentation_state='visible') AS visible_total,
          (SELECT count(*)::int FROM matched WHERE presentation_state<>'visible') AS hidden_total,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('response_id',response_id,'occurrence',occurrence,'presentation',
            jsonb_build_object('state',presentation_state,'snoozed_until',snoozed_until)) ORDER BY response_id) FROM page),'[]'::jsonb) AS items`)
      ).rows[0];
      const items = (data?.items ?? []).slice(0, query.limit);
      const last = items.at(-1);
      const more = (data?.items.length ?? 0) > query.limit;
      await auditPersonalMetadata(
        tx,
        actor,
        surveyId,
        items.map((r) => r.response_id),
      );
      return {
        computed_at: new Date().toISOString(),
        items,
        total: Number(data?.total ?? 0),
        visible_total: Number(data?.visible_total ?? 0),
        hidden_total: Number(data?.hidden_total ?? 0),
        page: {
          has_more: more,
          ...(more && last
            ? {
                cursor: Buffer.from(JSON.stringify({ bind, id: last.response_id })).toString(
                  'base64url',
                ),
              }
            : {}),
        },
      };
    });
  }
  async function getOutcomeRecoveryHistory(
    actor: SurveysActor,
    surveyId: string,
    query: { limit: number; cursor?: string | undefined },
  ) {
    return deps.db.transaction(async (tx) => {
      const source = await findSurvey(tx, actor.workspace_id, surveyId);
      if (!source || source.type !== 'outcome')
        throw new HttpError('not_found.record', 'survey not found');
      const read = await checkSurveyRead(
        deps.checkService,
        actor,
        source.primary_managed_system_id,
        { tx },
      );
      if (!read.allow) throw new HttpError('not_found.record', 'survey not found');
      const personal = await checkSurveyPersonalResponseRead(
        deps.checkService,
        actor,
        source.primary_managed_system_id,
        { tx },
      );
      if (!personal.allow) throw new HttpError('not_found.record', 'survey not found');
      const bind = createHash('sha256')
        .update(JSON.stringify({ actor, surveyId, system: source.primary_managed_system_id }))
        .digest('hex');
      const invalid = () =>
        new HttpError('validation.failed', 'invalid cursor', {
          fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
        });
      let cursor: { bind: string; at: string; id: string } | undefined;
      if (query.cursor) {
        try {
          cursor = z
            .object({ bind: z.string(), at: z.string().datetime(), id: z.string().uuid() })
            .strict()
            .parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
          if (
            cursor.bind !== bind ||
            Buffer.from(JSON.stringify(cursor)).toString('base64url') !== query.cursor
          )
            throw invalid();
        } catch {
          throw invalid();
        }
      }
      const cutoff = sql`${recoveryHistoryWindowStart(deps.recoveryClock?.() ?? new Date()).toISOString()}::timestamptz`;
      const data = (
        await tx.execute<{
          total: number;
          window_start: string;
          items: Array<{
            id: string;
            response_id: string;
            occurrence: number;
            resolved_at: string;
            outcome: string;
            evidence: string;
            action: string | null;
          }>;
        }>(sql`
        WITH permitted AS MATERIALIZED (SELECT DISTINCT response_id FROM survey.read_outcome_follow_up_items_personal(${actor.workspace_id}::uuid,${surveyId}::uuid)),
        matched AS MATERIALIZED (SELECT h.* FROM survey.outcome_recovery_history h JOIN permitted p ON p.response_id=h.outcome_recovery_item_id::uuid
          WHERE h.workspace_id=${actor.workspace_id}::uuid AND h.resolved_at>=${cutoff}),
        page AS (SELECT * FROM matched WHERE ${cursor ? sql`(resolved_at,id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql`true`}
          ORDER BY resolved_at DESC,id DESC LIMIT ${query.limit + 1})
        SELECT (SELECT count(*)::int FROM matched) AS total,
          to_char(${cutoff} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS window_start,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'response_id',outcome_recovery_item_id,'occurrence',occurrence,
            'resolved_at',to_char(resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'outcome',outcome,'evidence',evidence,'action',action)
            ORDER BY resolved_at DESC,id DESC) FROM page),'[]'::jsonb) AS items`)
      ).rows[0];
      const items = (data?.items ?? []).slice(0, query.limit);
      const last = items.at(-1);
      const more = (data?.items.length ?? 0) > query.limit;
      await auditPersonalMetadata(tx, actor, surveyId, [
        ...new Set(items.map((r) => r.response_id)),
      ]);
      return {
        computed_at: new Date().toISOString(),
        window_start: data?.window_start,
        total: Number(data?.total ?? 0),
        items,
        page: {
          has_more: more,
          ...(more && last
            ? {
                cursor: Buffer.from(
                  JSON.stringify({ bind, at: last.resolved_at, id: last.id }),
                ).toString('base64url'),
              }
            : {}),
        },
      };
    });
  }
  return {
    patchOutcomeRecoveryPresentation,
    getOutcomeRecoveryPresentation,
    getOutcomeRecoveryHistory,
    listOutcomeRecovery,
  };
}

export const createOutcomeRecoveryRecorder = () => ({
  captureFinding: captureFindingOutcomeRecovery,
  async finish(tx: Tx, captures: OutcomeRecoveryCapture[], actorId: string, action: string) {
    for (const captured of captures) await finishOutcomeRecovery(tx, captured, actorId, action);
  },
});
export type OutcomeRecoveryRecorder = ReturnType<typeof createOutcomeRecoveryRecorder>;

/** Internal reconciliation returns only a continuation key; it never supplies personal API payloads. */
export async function observeOutcomeRecovery(
  tx: Tx,
  workspaceId: string,
  surveyId: string,
  after?: string,
) {
  await lockRecoveryCommand(tx, workspaceId);
  const rows = (
    await tx.execute<{
      response_id: string;
    }>(sql`SELECT response_id FROM survey.read_outcome_recovery_sources(${workspaceId}::uuid,${surveyId}::uuid)
    WHERE ${after ? sql`response_id>${after}::uuid` : sql`true`} ORDER BY response_id LIMIT 101`)
  ).rows;
  for (const row of rows.slice(0, 100)) {
    const captured = await captureOutcomeRecovery(tx, workspaceId, row.response_id, surveyId);
    const stored = (
      await tx.execute<{
        state: OutcomeRecoveryCapture['state'];
      }>(sql`SELECT state FROM survey.outcome_recovery_identities
      WHERE workspace_id=${workspaceId}::uuid AND outcome_recovery_item_id=${row.response_id} FOR UPDATE`)
    ).rows[0];
    if (!stored && captured.state === 'active')
      await tx.execute(sql`INSERT INTO survey.outcome_recovery_identities
      (workspace_id,outcome_recovery_item_id,category,source_id,occurrence,state)
      VALUES (${workspaceId}::uuid,${row.response_id},'bad-outcome-response-no-followup',${row.response_id}::uuid,1,'active')
      ON CONFLICT (workspace_id,outcome_recovery_item_id) DO NOTHING`);
    if (stored)
      await finishOutcomeRecovery(
        tx,
        { ...captured, state: stored.state },
        null,
        null,
        'observation',
      );
  }
  return rows.length > 100 ? rows[99]?.response_id : undefined;
}
