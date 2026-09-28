// Outcome follow-up decisions (ADR-0055, issue #510 part B). The surveys
// module owns the mark-no-follow-up / reopen-follow-up commands; the
// classification itself runs inside the SECURITY DEFINER function
// survey.read_outcome_follow_up_state, because fops_app cannot read response
// or answer rows.
//
// Single transaction contract per command (AGENTS.md, ADR-0008/0015):
//   1. Idempotency lookup against (actor_id, key) inside runIdempotent, with
//      the advisory lock and all state checks inside the miss path.
//   2. Personal-response seam first: response existence, workspace scope,
//      survey.read, and survey.read_personal_responses collapse to one 404
//      (no Admin bypass, exactly like create-finding).
//   3. finding.manage on the survey's primary Managed System (Admin role
//      bypass intact) — 403 permission.denied.
//   4. Classifier state: not classifiable as poor → 409 conflict.stale_write
//      detail.failure_code 'action_no_longer_available'; already resolved →
//      409 conflict.stale_write detail.failure_code 'recovery_item_resolved'.
//   5. Upsert the single current state row and audit the transition in the
//      same transaction. History lives in core.audit_log, never in a second
//      domain row.

import {
  type OutcomeFollowUpDecisionRequest,
  type OutcomeFollowUpItem,
  type OutcomeFollowUpMarkedResult,
  type OutcomeFollowUpNextAction,
  type OutcomeFollowUpReadDto,
  type OutcomeFollowUpReopenedResult,
  outcomeFollowUpMarkedResultSchema,
  outcomeFollowUpReadDtoSchema,
  outcomeFollowUpReopenedResultSchema,
} from '@fops/shared';
import { and, eq, sql } from 'drizzle-orm';

import { outcomeFollowUpDecisions } from '../../db/schema/survey.js';
import { HttpError } from '../../lib/errors.js';
import {
  actorFindingReadScope,
  checkFindingManage,
  isFindingInReadScope,
} from '../findings/authorization.js';
import { checkSurveyPersonalResponseRead, checkSurveyRead } from './authorization.js';
import { resolveSurveyResponseEvidenceAccess } from './evidence-access.js';
import { findSurvey } from './repo-read.js';
import {
  readOutcomeFollowUpItemsPersonal,
  readOutcomeFollowUpState,
  readOutcomeFollowUpSurveyState,
} from './repo-results.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

function staleWrite(
  failureCode: 'action_no_longer_available' | 'recovery_item_resolved',
  message: string,
) {
  return new HttpError('conflict.stale_write', message, { failure_code: failureCode });
}

export function createSurveyFollowUp(deps: SurveysServiceDeps) {
  async function markNoFollowUp(args: {
    actor: SurveysActor;
    responseId: string;
    input: OutcomeFollowUpDecisionRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: OutcomeFollowUpMarkedResult }> {
    const { actor, responseId, input, idempotencyKey, requestHash } = args;
    const reason = input.reason.trim();
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const { subject } = await resolveSurveyResponseEvidenceAccess(
            deps,
            tx,
            actor,
            responseId,
            'follow_up_decision',
          );
          const manage = await checkFindingManage(
            deps.checkService,
            actor,
            subject.primary_managed_system_id,
            { requireElevatedRole: false },
            { tx },
          );
          if (!manage.allow)
            throw new HttpError('permission.denied', 'finding.manage capability required');
          const state = await readOutcomeFollowUpState(tx, actor.workspace_id, responseId);
          if (!state) throw new HttpError('not_found.record', 'survey response not found');
          if (!state.is_poor)
            throw staleWrite(
              'action_no_longer_available',
              'survey response is not classified as a poor outcome requiring follow-up',
            );
          if (state.resolution !== 'open')
            throw staleWrite(
              'recovery_item_resolved',
              'survey response follow-up is already resolved',
            );
          const rows = await tx
            .insert(outcomeFollowUpDecisions)
            .values({
              workspaceId: actor.workspace_id,
              surveyId: subject.survey_id,
              responseId,
              managedSystemId: subject.primary_managed_system_id,
              state: 'no_follow_up',
              reason,
              decidedByActorId: actor.actor_id,
            })
            .onConflictDoUpdate({
              target: [outcomeFollowUpDecisions.workspaceId, outcomeFollowUpDecisions.responseId],
              set: {
                state: 'no_follow_up',
                reason,
                decidedByActorId: actor.actor_id,
                updatedAt: sql`now()`,
              },
            })
            .returning({ updatedAt: outcomeFollowUpDecisions.updatedAt });
          const updatedAt = rows[0]?.updatedAt;
          if (!updatedAt)
            throw new HttpError('internal.unexpected', 'follow-up decision upsert returned no row');
          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'survey_outcome_no_follow_up_marked',
            subject_type: 'survey_response',
            subject_id: responseId,
            summary: 'Survey outcome follow-up marked as not needed',
            detail: {
              survey_id: subject.survey_id,
              managed_system_id: subject.primary_managed_system_id,
              reason,
            },
          });
          return {
            status: 200,
            body: outcomeFollowUpMarkedResultSchema.parse({
              response_id: responseId,
              resolution: 'no_follow_up',
              updated_at: updatedAt.toISOString(),
            }),
          };
        },
      ),
    );
  }

  async function reopenFollowUp(args: {
    actor: SurveysActor;
    responseId: string;
    input: OutcomeFollowUpDecisionRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: OutcomeFollowUpReopenedResult }> {
    const { actor, responseId, input, idempotencyKey, requestHash } = args;
    const reason = input.reason.trim();
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const { subject } = await resolveSurveyResponseEvidenceAccess(
            deps,
            tx,
            actor,
            responseId,
            'follow_up_decision',
          );
          const manage = await checkFindingManage(
            deps.checkService,
            actor,
            subject.primary_managed_system_id,
            { requireElevatedRole: false },
            { tx },
          );
          if (!manage.allow)
            throw new HttpError('permission.denied', 'finding.manage capability required');
          const locked = await tx
            .select({
              id: outcomeFollowUpDecisions.id,
              state: outcomeFollowUpDecisions.state,
              reason: outcomeFollowUpDecisions.reason,
            })
            .from(outcomeFollowUpDecisions)
            .where(
              and(
                eq(outcomeFollowUpDecisions.workspaceId, actor.workspace_id),
                eq(outcomeFollowUpDecisions.responseId, responseId),
              ),
            )
            .limit(1)
            .for('update');
          const current = locked[0];
          if (!current || current.state !== 'no_follow_up')
            throw staleWrite(
              'action_no_longer_available',
              'no current no-follow-up decision to reopen',
            );
          const rows = await tx
            .update(outcomeFollowUpDecisions)
            .set({
              state: 'reopened',
              reason,
              decidedByActorId: actor.actor_id,
              updatedAt: sql`now()`,
            })
            .where(eq(outcomeFollowUpDecisions.id, current.id))
            .returning({ updatedAt: outcomeFollowUpDecisions.updatedAt });
          const updatedAt = rows[0]?.updatedAt;
          if (!updatedAt)
            throw new HttpError('internal.unexpected', 'follow-up decision update returned no row');
          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'survey_outcome_follow_up_reopened',
            subject_type: 'survey_response',
            subject_id: responseId,
            summary: 'Survey outcome follow-up reopened',
            detail: {
              survey_id: subject.survey_id,
              managed_system_id: subject.primary_managed_system_id,
              reason,
              previous_reason: current.reason,
            },
          });
          return {
            status: 200,
            body: outcomeFollowUpReopenedResultSchema.parse({
              response_id: responseId,
              resolution: 'open',
              updated_at: updatedAt.toISOString(),
            }),
          };
        },
      ),
    );
  }

  // #510 part C read model (ADR-0055). Mirrors the results read path
  // (results.ts): survey.read scoped to the primary Managed System, then the
  // personal gate decides `personal_access` instead of a 404. A non-holder
  // receives ONLY the survey-grain booleans — no counts, no response ids —
  // so the payload cannot become a subtraction oracle. The personal item
  // rows are read through the 0053 definer exclusively after the gate, and
  // every exposed (response, low-answer question) pair is audited in the
  // same transaction, exactly like a holder result read.
  async function getOutcomeFollowUp(
    actor: SurveysActor,
    surveyId: string,
  ): Promise<OutcomeFollowUpReadDto> {
    const survey = await findSurvey(deps.db, actor.workspace_id, surveyId);
    if (!survey) throw new HttpError('not_found.record', 'survey not found');
    const read = await checkSurveyRead(deps.checkService, actor, survey.primary_managed_system_id);
    if (!read.allow) throw new HttpError('not_found.record', 'survey not found');
    if (survey.type !== 'outcome') throw new HttpError('not_found.record', 'survey not found');
    if (survey.status === 'draft')
      throw new HttpError('conflict.survey_results_unavailable', 'survey results unavailable');
    const personal = await checkSurveyPersonalResponseRead(
      deps.checkService,
      actor,
      survey.primary_managed_system_id,
    );
    const holder = personal.allow;
    return deps.db.transaction(async (tx) => {
      const [surveyState, manage] = await Promise.all([
        readOutcomeFollowUpSurveyState(tx, actor.workspace_id, survey.id),
        checkFindingManage(deps.checkService, actor, survey.primary_managed_system_id, {
          requireElevatedRole: false,
        }),
      ]);
      if (!surveyState) throw new HttpError('not_found.record', 'survey not found');
      const requestablePermission = {
        permission: 'finding.manage' as const,
        managed_system_id: survey.primary_managed_system_id,
      };
      // All three action ids share one availability rule; the closure keeps
      // them in lockstep with the caller's finding.manage decision.
      const nextAction = (id: OutcomeFollowUpNextAction['id']): OutcomeFollowUpNextAction =>
        manage.allow
          ? { id, availability: 'allowed' }
          : {
              id,
              availability: 'blocked_requestable',
              requestable_permission: manage.requestable !== null ? requestablePermission : null,
            };
      const rows = holder
        ? await readOutcomeFollowUpItemsPersonal(tx, actor.workspace_id, survey.id)
        : [];
      // Finding metadata follows the caller's Finding read scope (the
      // results.ts request_task precedent): a created Finding may even sit on
      // a different Managed System than the survey, so the definer returns
      // the Finding's own primary Managed System for this check. The
      // resolution itself stays Survey-owned and keeps saying 'finding'.
      const findingReadScope = holder
        ? await actorFindingReadScope(tx, actor, { requireElevatedRole: true })
        : null;
      const items: OutcomeFollowUpItem[] = [];
      const exposed: Array<{ responseId: string; questionId: string }> = [];
      for (const row of rows) {
        let item = items[items.length - 1];
        if (!item || item.response_id !== row.response_id) {
          item = {
            response_id: row.response_id,
            response_number: row.response_number,
            submitted_at: new Date(row.submitted_at).toISOString(),
            low_answers: [],
            resolution: row.resolution,
            finding:
              row.finding_id &&
              row.finding_display_id &&
              row.finding_status &&
              row.finding_managed_system_id &&
              findingReadScope &&
              isFindingInReadScope(findingReadScope, row.finding_managed_system_id)
                ? {
                    id: row.finding_id,
                    display_id: row.finding_display_id,
                    status: row.finding_status,
                  }
                : null,
            decision:
              row.decision_state && row.decision_reason && row.decision_updated_at
                ? {
                    state: row.decision_state,
                    reason: row.decision_reason,
                    updated_at: new Date(row.decision_updated_at).toISOString(),
                  }
                : null,
            next_actions:
              row.resolution === 'finding'
                ? []
                : row.resolution === 'no_follow_up'
                  ? [nextAction('reopen_follow_up')]
                  : [nextAction('create_finding'), nextAction('mark_no_follow_up')],
          };
          items.push(item);
        }
        item.low_answers.push({
          question_id: row.question_id,
          question_label: row.question_label,
          value: row.answer_value,
          rating_min: row.rating_min,
          rating_max: row.rating_max,
        });
        exposed.push({ responseId: row.response_id, questionId: row.question_id });
      }
      if (holder) {
        for (const { responseId, questionId } of exposed)
          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'survey_response_personal_read',
            subject_type: 'survey_response',
            subject_id: responseId,
            summary: 'Survey response personal follow-up read',
            detail: {
              survey_id: survey.id,
              survey_response_id: responseId,
              question_id: questionId,
            },
          });
      }
      return outcomeFollowUpReadDtoSchema.parse({
        survey_id: survey.id,
        classifiable: surveyState.classifiable,
        follow_up_needed: surveyState.follow_up_needed,
        personal_access: holder,
        items: holder ? items : null,
      });
    });
  }

  return { getOutcomeFollowUp, markNoFollowUp, reopenFollowUp };
}
