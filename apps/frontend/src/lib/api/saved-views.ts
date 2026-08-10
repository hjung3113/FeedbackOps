import { apiClient } from './client';

export type SavedViewSurface = 'voc' | 'tasks' | 'task_requests' | 'findings';

export interface SavedView {
  id: string;
  surface: SavedViewSurface;
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function fetchSavedViews(surface?: SavedViewSurface, signal?: AbortSignal): Promise<{ items: SavedView[] }> {
  const qs = new URLSearchParams();
  if (surface !== undefined) qs.set('surface', surface);
  const path = qs.size > 0 ? `/saved-views?${qs.toString()}` : '/saved-views';
  return (await apiClient<{ items: SavedView[] }>('GET', path, {
    ...(signal !== undefined ? { signal } : {}),
  })).data;
}

export async function createSavedView(input: Pick<SavedView, 'surface' | 'name' | 'filter'>): Promise<SavedView> {
  return (await apiClient<SavedView>('POST', '/saved-views', { body: input })).data;
}

export async function deleteSavedView(id: string): Promise<void> {
  await apiClient('DELETE', `/saved-views/${id}`);
}
