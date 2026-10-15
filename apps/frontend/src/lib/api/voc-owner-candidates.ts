import { vocOwnerCandidatesSchema } from '@fops/shared';
import { apiRequest } from './client';

export async function fetchVocOwnerCandidates(vocId: string, signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    `/vocs/${vocId}/owner-candidates`,
    vocOwnerCandidatesSchema,
    signal ? { signal } : {},
  );
  return response.data;
}
