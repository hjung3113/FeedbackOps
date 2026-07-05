import type {
  ApproveTaskRequestRequest,
  RejectTaskRequestRequest,
  RequestMoreEvidenceTaskRequestRequest,
  TaskRequestDto,
  TaskRequestStatus,
} from '@fops/shared';

import { apiClient } from './client';

export interface ListTaskRequestsResponse {
  items: TaskRequestDto[];
}

export async function fetchTaskRequests(
  options: { status?: TaskRequestStatus; signal?: AbortSignal } = {},
): Promise<ListTaskRequestsResponse> {
  const qs = new URLSearchParams();
  if (options.status !== undefined) qs.set('status', options.status);
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
