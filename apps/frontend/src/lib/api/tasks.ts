import type {
  ConvertTaskRequestRequest,
  FindingDto,
  LinkExistingTaskRequest,
  LinkTaskRequest,
  TaskDetailDto,
  TaskDto,
  TaskStatus,
} from '@fops/shared';

import { apiClient } from './client';

export interface ListTasksResponse {
  items: TaskDto[];
}

export async function listTasks(
  options: {
    status?: TaskStatus;
    assignee?: string;
    managed_system_id?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ListTasksResponse> {
  const qs = new URLSearchParams();
  if (options.status !== undefined) qs.set('status', options.status);
  if (options.assignee !== undefined) qs.set('assignee', options.assignee);
  if (options.managed_system_id !== undefined) {
    qs.set('managed_system_id', options.managed_system_id);
  }
  const path = qs.size > 0 ? `/tasks?${qs.toString()}` : '/tasks';
  const res = await apiClient<ListTasksResponse>('GET', path, {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return res.data;
}

export async function getTask(id: string, signal?: AbortSignal): Promise<TaskDetailDto> {
  const res = await apiClient<TaskDetailDto>('GET', `/tasks/${id}`, {
    ...(signal !== undefined ? { signal } : {}),
  });
  return res.data;
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  options: { ifMatch: string; idempotencyKey: string },
): Promise<TaskDetailDto> {
  const res = await apiClient<TaskDetailDto>('PATCH', `/tasks/${id}`, {
    body: { status },
    ifMatch: options.ifMatch,
    idempotencyKey: options.idempotencyKey,
  });
  return res.data;
}

export async function convertTaskRequest(
  id: string,
  body: ConvertTaskRequestRequest,
  idempotencyKey: string,
): Promise<TaskDto> {
  const res = await apiClient<TaskDto>('POST', `/task-requests/${id}/convert`, {
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function linkExistingTask(
  id: string,
  body: LinkExistingTaskRequest,
  idempotencyKey: string,
): Promise<TaskDto> {
  const res = await apiClient<TaskDto>('POST', `/task-requests/${id}/link-task`, {
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function linkTaskToFinding(
  findingId: string,
  body: LinkTaskRequest,
  idempotencyKey: string,
): Promise<FindingDto> {
  const res = await apiClient<FindingDto>('POST', `/findings/${findingId}/link-task`, {
    body,
    idempotencyKey,
  });
  return res.data;
}
