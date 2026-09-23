import type { AdminPermissionRequestRow } from '@/lib/api';
import { z } from 'zod';

// Tab + selection are URL state (docs/frontend/routes-and-layout.md §URL State
// Rules): /admin/permissions/requests?tab=approved&selected=:requestId.
// `pending` is the default tab and omitted from the URL.
export const permissionRequestsSearchSchema = z
  .object({
    tab: z.enum(['needs_more_info', 'approved', 'rejected', 'all']).optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

export type PermissionRequestsSearch = z.infer<typeof permissionRequestsSearchSchema>;

export type ReviewTab = AdminPermissionRequestRow['status'] | 'all';

export const permissionRequestTabs: Array<{ value: ReviewTab; label: string }> = [
  { value: 'pending', label: '대기 중' },
  { value: 'needs_more_info', label: '추가 정보 필요' },
  { value: 'approved', label: '승인됨' },
  { value: 'rejected', label: '거절됨' },
  { value: 'all', label: '전체' },
];

export const permissionRequestStatusLabel: Record<AdminPermissionRequestRow['status'], string> = {
  pending: '대기 중',
  needs_more_info: '추가 정보 필요',
  approved: '승인됨',
  rejected: '거절됨',
};

export function formatPermissionRequestDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
