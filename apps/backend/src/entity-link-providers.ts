import { opaqueSurveyResponseProvider } from './modules/entity-links/opaque-survey-response-provider.js';
import type { EntityLinkProviderRegistry } from './modules/entity-links/provider-types.js';
import { findingEntityLinkProvider } from './modules/findings/entity-link-provider.js';
import { taskRequestEntityLinkProvider } from './modules/task-requests/entity-link-provider.js';
import { taskEntityLinkProvider } from './modules/tasks/entity-link-provider.js';
import { vocEntityLinkProvider } from './modules/voc/entity-link-provider.js';
import { vocClusterEntityLinkProvider } from './modules/voc-clusters/entity-link-provider.js';

export function buildEntityLinkProviders(): EntityLinkProviderRegistry {
  return {
    voc: vocEntityLinkProvider,
    survey_response: opaqueSurveyResponseProvider,
    finding: findingEntityLinkProvider,
    voc_cluster: vocClusterEntityLinkProvider,
    task_request: taskRequestEntityLinkProvider,
    task: taskEntityLinkProvider,
  };
}
