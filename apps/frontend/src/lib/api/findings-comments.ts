// findings-comments.ts — Finding progress-note timeline reads/writes (#377).
//
// Contract: docs/implementation/api/findings.md §Finding
//   GET  /findings/:id/comments — finding.read only
//   POST /findings/:id/comments — finding.manage; Idempotency-Key required
//         (apiRequest auto-mints one per POST call).
// apiRequest + shared zod parsers per apps/frontend/AGENTS.md — no unparsed calls.

import {
  type CreateFindingCommentRequest,
  type CreateFindingCommentResponse,
  type ListFindingCommentsResponse,
  createFindingCommentResponseSchema,
  listFindingCommentsResponseSchema,
} from '@fops/shared';

import { apiRequest } from './client';

export async function listFindingComments(
  findingId: string,
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<ListFindingCommentsResponse> {
  const qs = new URLSearchParams();
  if (options.cursor !== undefined) qs.set('cursor', options.cursor);
  const path = `/findings/${findingId}/comments${qs.size > 0 ? `?${qs.toString()}` : ''}`;
  const res = await apiRequest('GET', path, listFindingCommentsResponseSchema, {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return res.data;
}

export async function createFindingComment(
  findingId: string,
  body: CreateFindingCommentRequest,
): Promise<CreateFindingCommentResponse> {
  const res = await apiRequest(
    'POST',
    `/findings/${findingId}/comments`,
    createFindingCommentResponseSchema,
    {
      body,
    },
  );
  return res.data;
}
