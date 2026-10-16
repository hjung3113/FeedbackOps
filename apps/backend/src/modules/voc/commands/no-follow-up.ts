import type { RecordVocNoFollowUpRequest } from '@fops/shared';
import { HttpError } from '../../../lib/errors.js';
import { runIdempotentCommand } from '../../core/idempotency/idempotent-command.js';
import { lockManagedSystem } from '../../managed-systems/index.js';
import { assertVocTriage } from '../authorization.js';
import {
  readVocFollowUpState,
  recordVocNoFollowUp,
  withdrawVocNoFollowUp,
} from '../no-follow-up-repository.js';
import type { ReadActorContext } from '../read-service.js';
import { selectVocForUpdate } from '../repo.js';
import type { VocServiceDeps } from '../service.js';

export function createVocNoFollowUpCommands(deps: VocServiceDeps) {
  async function noFollowUpCommand(args: {
    actor: ReadActorContext;
    vocId: string;
    input: RecordVocNoFollowUpRequest | null;
    idempotencyKey: string;
    requestHash: string;
  }) {
    const { actor, vocId, input } = args;
    return runIdempotentCommand({
      db: deps.db,
      idempotencyService: deps.idempotencyService,
      actorId: actor.actor_id,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      status: 200,
      recoveryWorkspaceId: actor.workspace_id,
      work: async (tx) => {
        const captured = await deps.recoveryRecorder?.capture(tx, actor.workspace_id, [
          { type: 'voc', id: vocId },
        ]);
        const row = await selectVocForUpdate(tx, actor.workspace_id, vocId);
        if (!row) throw new HttpError('not_found.record', 'VOC not found');
        await assertVocTriage(tx, deps.checkService, actor, row.primaryManagedSystemId);
        if (row.archivedAt !== null)
          throw new HttpError('conflict.record_archived', 'VOC is archived');
        const parent = await lockManagedSystem(tx, actor.workspace_id, row.primaryManagedSystemId);
        if (!parent) throw new HttpError('not_found.record', 'managed system not found');
        if (parent.archived_at !== null)
          throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
            fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
          });
        const state = await readVocFollowUpState(tx, actor.workspace_id, vocId, true);
        if (input ? !state.can_record : !state.can_withdraw) {
          throw new HttpError('conflict.stale_write', 'VOC follow-up action unavailable', {
            failure_code: 'action_no_longer_available',
          });
        }
        if (input)
          await recordVocNoFollowUp(tx, actor.workspace_id, vocId, actor.actor_id, input.reason);
        else await withdrawVocNoFollowUp(tx, actor.workspace_id, vocId);
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: input ? 'voc_no_follow_up_recorded' : 'voc_no_follow_up_withdrawn',
          subject_type: 'voc',
          subject_id: vocId,
          summary: input
            ? 'VOC no-follow-up decision recorded'
            : 'VOC no-follow-up decision withdrawn',
          detail: {
            voc_id: vocId,
            actor_id: actor.actor_id,
            ...(input ? { reason: input.reason } : {}),
          },
        });
        if (captured)
          await deps.recoveryRecorder?.finish(
            tx,
            captured,
            actor.actor_id,
            input ? 'recordVocNoFollowUp' : 'withdrawVocNoFollowUp',
          );
        return deps.vocReadService.composeDetailEnvelope({ tx, actor, vocId });
      },
    });
  }
  return { noFollowUpCommand };
}
