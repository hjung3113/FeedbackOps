import { taskDtoSchema } from '@fops/shared';
import type { ListTasksResponse } from '@fops/shared';
import { apiRequest } from './client';
export type { ListTasksResponse } from '@fops/shared';
import type {
  AssignTaskMilestoneRequest,
  ConvertTaskRequestRequest,
  FindingDto,
  LinkExistingTaskRequest,
  LinkTaskRequest,
  TaskDetailDto,
  TaskDto,
  TaskStatus,
} from '@fops/shared';

import { apiClient } from './client';

export async function listTasks(
  options: {
    status?: TaskStatus;
    assignee?: string;
    assignee_team_id?: string;
    managed_system_id?: string;
    analytics_area_id?: string;
    status_group?: 'in-flight';
    overdue?: 'true';
    reporter_update?: 'needed';
    public_update?: 'missing';
    milestone_id?: string;
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ListTasksResponse> {
  const qs = new URLSearchParams();
  if (options.limit !== undefined) qs.set('limit', String(options.limit));
  if (options.cursor !== undefined) qs.set('cursor', options.cursor);
  if (options.status !== undefined) qs.set('status', options.status);
  if (options.assignee !== undefined) qs.set('assignee', options.assignee);
  if (options.assignee_team_id !== undefined) qs.set('assignee_team_id', options.assignee_team_id);
  if (options.managed_system_id !== undefined) {
    qs.set('managed_system_id', options.managed_system_id);
  }
  if (options.analytics_area_id !== undefined)
    qs.set('analytics_area_id', options.analytics_area_id);
  if (options.status_group !== undefined) qs.set('status_group', options.status_group);
  if (options.overdue !== undefined) qs.set('overdue', options.overdue);
  if (options.reporter_update !== undefined) qs.set('reporter_update', options.reporter_update);
  if (options.public_update === 'missing') qs.set('public_update', 'missing');
  if (options.milestone_id !== undefined) {
    qs.set('milestone_id', options.milestone_id);
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

export async function assignTaskResponsibility(
  id: string,
  body: import('@fops/shared').AssignTaskResponsibilityRequest,
  idempotencyKey: string,
  ifMatch: string,
) {
  const response = await apiRequest('POST', `/tasks/${id}/responsibility`, taskDtoSchema, {
    body,
    idempotencyKey,
    ifMatch,
  });
  return response.data;
}

// #1181 — POST /tasks/:id/milestone. `null` clears the assignment; If-Match is
// the Task's updated_at (docs/implementation/api/tasks.md §POST /tasks/:id/milestone).
export async function assignTaskMilestone(
  id: string,
  body: AssignTaskMilestoneRequest,
  idempotencyKey: string,
  ifMatch: string,
) {
  const response = await apiRequest('POST', `/tasks/${id}/milestone`, taskDtoSchema, {
    body,
    idempotencyKey,
    ifMatch,
  });
  return response.data;
}
