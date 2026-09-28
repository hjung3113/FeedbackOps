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
  type OutcomeFollowUpMarkedResult,
  type OutcomeFollowUpReopenedResult,
  outcomeFollowUpMarkedResultSchema,
  outcomeFollowUpReopenedResultSchema,
} from '@fops/shared';
import { and, eq, sql } from 'drizzle-orm';

import { outcomeFollowUpDecisions } from '../../db/schema/survey.js';
import { HttpError } from '../../lib/errors.js';
import { checkFindingManage } from '../findings/authorization.js';
import { resolveSurveyResponseEvidenceAccess } from './evidence-access.js';
import { readOutcomeFollowUpState } from './repo-results.js';
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

  return { markNoFollowUp, reopenFollowUp };
}
