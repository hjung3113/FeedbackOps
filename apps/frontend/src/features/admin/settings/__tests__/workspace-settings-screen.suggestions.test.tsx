import { resolveCoverageThresholds } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceSettingsForm } from '../WorkspaceSettingsScreen';

const initialSettings = {
  coverage_thresholds: resolveCoverageThresholds(),
  permission_self_approval: 'forbidden' as const,
  survey_anonymity_threshold: 9,
  voc_cluster_suggestions_enabled: false,
};
afterEach(() => vi.unstubAllGlobals());
it('toggles Cluster suggestions and saves only the boolean while preserving other settings', async () => {
  const patches: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path, init: RequestInit) => {
      if (_path === '/me')
        return new Response(
          JSON.stringify({
            actor: { id: 'admin', role_level: 'admin' },
            workspace_id: 'workspace',
          }),
          { status: 200 },
        );
      if (init.method === 'GET')
        return new Response(JSON.stringify({ available: true, items: [] }), { status: 200 });
      const patch = JSON.parse(String(init.body));
      patches.push(patch);
      return new Response(JSON.stringify({ ...initialSettings, ...patch }), { status: 200 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceSettingsForm initialSettings={initialSettings} />
    </QueryClientProvider>,
  );
  const section = (await screen.findByRole('heading', { name: 'Cluster 제안' })).closest('section');
  if (!section) throw new Error('Suggestion section missing');
  expect(within(section).getByText('사용 안 함')).toBeInTheDocument();
  fireEvent.click(within(section).getByRole('button', { name: '편집' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Cluster 제안 생성' }));
  fireEvent.click(await screen.findByRole('option', { name: /^사용$/ }));
  fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
  await waitFor(() => expect(patches).toEqual([{ voc_cluster_suggestions_enabled: true }]));
  await waitFor(() =>
    expect(screen.queryByTestId('workspace-settings-save-bar')).not.toBeInTheDocument(),
  );
});

it('omits the opt-in for unavailable embeddings and never patches an untouched saved true', async () => {
  const patches: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path, init: RequestInit) => {
      if (_path === '/me')
        return new Response(
          JSON.stringify({
            actor: { id: 'admin', role_level: 'admin' },
            workspace_id: 'workspace',
          }),
          { status: 200 },
        );
      if (init.method === 'GET')
        return new Response(
          JSON.stringify({ available: false, reason: 'provider_disabled', items: [] }),
          { status: 200 },
        );
      const patch = JSON.parse(String(init.body));
      patches.push(patch);
      return new Response(
        JSON.stringify({ ...initialSettings, voc_cluster_suggestions_enabled: true, ...patch }),
        { status: 200 },
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceSettingsForm
        initialSettings={{ ...initialSettings, voc_cluster_suggestions_enabled: true }}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      client.getQueryData([
        'voc-cluster-suggestions',
        { managedSystemId: undefined, actorContext: 'workspace:admin:admin' },
      ]),
    ).toMatchObject({ available: false }),
  );
  expect(screen.queryByRole('heading', { name: 'Cluster 제안' })).not.toBeInTheDocument();
  const edit = screen.getAllByRole('button', { name: '편집' })[1];
  if (!edit) throw new Error('Anonymity edit missing');
  fireEvent.click(edit);
  fireEvent.change(screen.getByRole('spinbutton', { name: '익명성 임계값' }), {
    target: { value: '12' },
  });
  fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
  await waitFor(() => expect(patches).toEqual([{ survey_anonymity_threshold: 12 }]));
});

it('names the edited suggestion row in the save bar', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (path) =>
        new Response(
          JSON.stringify(
            path === '/me'
              ? { actor: { id: 'admin', role_level: 'admin' }, workspace_id: 'workspace' }
              : { available: true, items: [] },
          ),
          { status: 200 },
        ),
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceSettingsForm initialSettings={initialSettings} />
    </QueryClientProvider>,
  );
  const section = (await screen.findByRole('heading', { name: 'Cluster 제안' })).closest('section');
  if (!section) throw new Error('Suggestion section missing');
  fireEvent.click(within(section).getByRole('button', { name: '편집' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Cluster 제안 생성' }));
  fireEvent.click(await screen.findByRole('option', { name: /^사용$/ }));
  expect(
    within(screen.getByTestId('workspace-settings-save-bar')).getByText('Cluster 제안 생성', {
      exact: true,
    }),
  ).toBeInTheDocument();
});
