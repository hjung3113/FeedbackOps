import { legacyEntityLinkProviders } from './modules/entity-links/domain-providers.js';
import { opaqueSurveyResponseProvider } from './modules/entity-links/opaque-survey-response-provider.js';
import type { EntityLinkProviderRegistry } from './modules/entity-links/provider-types.js';
import { findingEntityLinkProvider } from './modules/findings/entity-link-provider.js';
import { taskRequestEntityLinkProvider } from './modules/task-requests/entity-link-provider.js';
import { vocEntityLinkProvider } from './modules/voc/entity-link-provider.js';
import { vocClusterEntityLinkProvider } from './modules/voc-clusters/entity-link-provider.js';

export function buildEntityLinkProviders(): EntityLinkProviderRegistry {
  return {
    ...legacyEntityLinkProviders, // task
    voc: vocEntityLinkProvider,
    survey_response: opaqueSurveyResponseProvider,
    task_request: taskRequestEntityLinkProvider,
    voc_cluster: vocClusterEntityLinkProvider,
    finding: findingEntityLinkProvider,
  };
}
