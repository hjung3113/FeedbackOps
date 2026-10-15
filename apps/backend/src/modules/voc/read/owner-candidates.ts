import { type VocOwnerCandidates, vocOwnerCandidatesSchema } from '@fops/shared';
import { listWorkspaceResponsibilityActors } from '../../auth/index.js';
import { assertVocTriage } from '../authorization.js';
import type { ReadActorContext, VocReadServiceDeps } from '../read-service.js';
import { validateOwner } from '../responsibility.js';
import type { createVocDetailReaders } from './detail.js';

export function createVocOwnerCandidatesReader(
  deps: VocReadServiceDeps,
  resolveVocAccess: ReturnType<typeof createVocDetailReaders>['resolveVocAccess'],
) {
  return async (args: { actor: ReadActorContext; vocId: string }): Promise<VocOwnerCandidates> =>
    deps.db.transaction(async (tx) => {
      const { actor } = args;
      const { row } = await resolveVocAccess({ ...args, tx });
      await assertVocTriage(tx, deps.checkService, actor, row.primaryManagedSystemId);
      const candidates = await listWorkspaceResponsibilityActors(
        tx,
        actor.workspace_id,
        row.ownerUserId,
      );
      const result: VocOwnerCandidates = { actors: [] };
      for (const candidate of candidates) {
        const failure = await validateOwner(
          tx,
          deps,
          actor.workspace_id,
          { id: row.primaryManagedSystemId },
          candidate.id,
          null,
        );
        if (!failure || candidate.id === row.ownerUserId) {
          result.actors.push({ ...candidate, eligible: failure === null });
        }
      }
      return vocOwnerCandidatesSchema.parse(result);
    });
}
