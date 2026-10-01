import {
  type EntityLinkEntityType,
  type ListEntityLinksResponse,
  listEntityLinksResponseSchema,
} from '@fops/shared';

import { apiRequest } from './client';

export async function fetchTaskRequestEntityLinks(
  taskRequestId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  return fetchEntityLinksBySource('task_request', taskRequestId, options);
}

export async function fetchEntityLinksBySource(
  sourceType: EntityLinkEntityType,
  sourceId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  // Endpoint mode accepts only the endpoint (relation_type is an inventory-only
  // filter); callers pick the relevant row from the response.
  const query = new URLSearchParams({ source_type: sourceType, source_id: sourceId });
  const response = await apiRequest(
    'GET',
    `/entity-links?${query.toString()}`,
    listEntityLinksResponseSchema,
    options,
  );
  return response.data;
}
