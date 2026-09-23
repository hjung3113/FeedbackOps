import type { EntityLinkProvider } from './provider-types.js';

export const opaqueSurveyResponseProvider: EntityLinkProvider = {
  entityType: 'survey_response',
  // Survey-response links are created and revoked only by C4 domain commands.
  // Generic entity-link surfaces must not resolve or disclose response IDs.
  assertExists: async () => null,
  getPermissionSubject: async () => null,
  canRead: async () => false,
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async () => null,
  listExpectedLinks: async () => [],
};
