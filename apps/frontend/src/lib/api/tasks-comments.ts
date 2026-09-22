// tasks-comments.ts — Task progress-note timeline reads/writes (#377).
//
// Contract: docs/implementation/03-api-contracts.md → Task
//   GET/POST /tasks/:id/comments — same shape as the Finding endpoints; the
//   backend gates both behind finding.manage + elevated role.
//   POST requires an Idempotency-Key (apiRequest auto-mints one per call).
// apiRequest + shared zod parsers per apps/frontend/AGENTS.md — no unparsed calls.

import {
  type CreateTaskCommentRequest,
  type CreateTaskCommentResponse,
  type ListTaskCommentsResponse,
  createTaskCommentResponseSchema,
  listTaskCommentsResponseSchema,
} from '@fops/shared';

import { apiRequest } from './client';

export async function listTaskComments(
  taskId: string,
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<ListTaskCommentsResponse> {
  const qs = new URLSearchParams();
  if (options.cursor !== undefined) qs.set('cursor', options.cursor);
  const path = `/tasks/${taskId}/comments${qs.size > 0 ? `?${qs.toString()}` : ''}`;
  const res = await apiRequest('GET', path, listTaskCommentsResponseSchema, {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return res.data;
}

export async function createTaskComment(
  taskId: string,
  body: CreateTaskCommentRequest,
): Promise<CreateTaskCommentResponse> {
  const res = await apiRequest(
    'POST',
    `/tasks/${taskId}/comments`,
    createTaskCommentResponseSchema,
    {
      body,
    },
  );
  return res.data;
}
