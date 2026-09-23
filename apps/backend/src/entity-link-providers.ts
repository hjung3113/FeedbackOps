import { legacyEntityLinkProviders } from './modules/entity-links/domain-providers.js';
import { opaqueSurveyResponseProvider } from './modules/entity-links/opaque-survey-response-provider.js';
import type { EntityLinkProviderRegistry } from './modules/entity-links/provider-types.js';
import { taskRequestEntityLinkProvider } from './modules/task-requests/entity-link-provider.js';

export function buildEntityLinkProviders(): EntityLinkProviderRegistry {
  return {
    ...legacyEntityLinkProviders, // voc, finding, voc_cluster, task
    survey_response: opaqueSurveyResponseProvider,
    task_request: taskRequestEntityLinkProvider,
  };
}
