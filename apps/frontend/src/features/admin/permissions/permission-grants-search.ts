import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { parseRouteSearch } from '@/lib/router/search';
import { z } from 'zod';

export const permissionGrantsSearchSchema = z
  .object({
    tab: z.literal('denies').optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

export type PermissionGrantsSearch = z.infer<typeof permissionGrantsSearchSchema>;
export type PermissionGrantTab = 'grants' | 'denies';

export function validatePermissionGrantsSearch(raw: unknown) {
  return parseRouteSearch(permissionGrantsSearchSchema, raw);
}

export const permissionGrantTabs: Array<{ value: PermissionGrantTab; label: string }> = [
  { value: 'grants', label: ADMIN_PERMISSIONS_COPY.grantsTab },
  { value: 'denies', label: ADMIN_PERMISSIONS_COPY.deniesTab },
];
