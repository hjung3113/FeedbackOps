import { taskRequestDtoSchema } from '@fops/shared';
import type { ListTaskRequestsResponse } from '@fops/shared';
import { apiRequest } from './client';
export type { ListTaskRequestsResponse } from '@fops/shared';
import type {
  ApproveTaskRequestRequest,
  RejectTaskRequestRequest,
  RequestMoreEvidenceTaskRequestRequest,
  TaskRequestDto,
  TaskRequestStatus,
} from '@fops/shared';

import { apiClient } from './client';

export async function fetchTaskRequests(
  options: {
    status?: TaskRequestStatus;
    managed_system_id?: string;
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ListTaskRequestsResponse> {
  const qs = new URLSearchParams();
  if (options.limit !== undefined) qs.set('limit', String(options.limit));
  if (options.cursor !== undefined) qs.set('cursor', options.cursor);
  if (options.status !== undefined) qs.set('status', options.status);
  if (options.managed_system_id !== undefined) {
    qs.set('managed_system_id', options.managed_system_id);
  }
  const path = qs.size > 0 ? `/task-requests?${qs.toString()}` : '/task-requests';
  const res = await apiClient<ListTaskRequestsResponse>('GET', path, {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return res.data;
}

export async function approveTaskRequest(
  id: string,
  body: ApproveTaskRequestRequest,
  idempotencyKey: string,
): Promise<TaskRequestDto> {
  const res = await apiClient<TaskRequestDto>('POST', `/task-requests/${id}/approve`, {
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function rejectTaskRequest(
  id: string,
  body: RejectTaskRequestRequest,
  idempotencyKey: string,
): Promise<TaskRequestDto> {
  const res = await apiClient<TaskRequestDto>('POST', `/task-requests/${id}/reject`, {
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function requestMoreEvidenceForTaskRequest(
  id: string,
  body: RequestMoreEvidenceTaskRequestRequest,
  idempotencyKey: string,
): Promise<TaskRequestDto> {
  const res = await apiClient<TaskRequestDto>(
    'POST',
    `/task-requests/${id}/request-more-evidence`,
    {
      body,
      idempotencyKey,
    },
  );
  return res.data;
}

export async function getTaskRequest(id: string, signal?: AbortSignal): Promise<TaskRequestDto> {
  const response = await apiRequest(
    'GET',
    `/task-requests/${id}`,
    taskRequestDtoSchema,
    signal === undefined ? {} : { signal },
  );
  return response.data;
}
