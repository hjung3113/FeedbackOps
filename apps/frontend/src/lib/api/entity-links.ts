import { type ListEntityLinksResponse, listEntityLinksResponseSchema } from '@fops/shared';

import { apiRequest } from './client';

export async function fetchTaskRequestEntityLinks(
  taskRequestId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  // Endpoint mode accepts only the endpoint (relation_type is an inventory-only
  // filter); callers pick the converted_to row from the response.
  const query = new URLSearchParams({ source_type: 'task_request', source_id: taskRequestId });
  const response = await apiRequest(
    'GET',
    `/entity-links?${query.toString()}`,
    listEntityLinksResponseSchema,
    options,
  );
  return response.data;
}
