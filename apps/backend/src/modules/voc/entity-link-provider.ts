import { resolveVocEndpoint } from '../entity-links/index.js';
import type { EntityLinkProvider } from '../entity-links/provider-types.js';

export const vocEntityLinkProvider: EntityLinkProvider = {
  entityType: 'voc',
  assertExists: resolveVocEndpoint,
  getPermissionSubject: resolveVocEndpoint,
  canRead: async (deps, actor, subject) => {
    if (subject.reporter_id && actor.actor_id === subject.reporter_id) return true;
    const readDecision = await deps.checkService.checkCapability(actor, 'voc.read', {
      workspace_id: actor.workspace_id,
      managed_system_id: subject.managed_system_id,
    });
    return readDecision.allow;
  },
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async () => null,
  listExpectedLinks: async () => [],
};
