import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppFrame } from '../AppFrame';

const MS_ONE = '11111111-1111-4111-8111-111111111111';
const MS_TWO = '22222222-2222-4222-8222-222222222222';

describe('AppFrame managed-system scope', () => {
  it('re-fetches nav counts with managed_system_id after scope selection', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === '/me') return json({ actor: { id: 'actor', external_id: 'actor', email: 'actor@test', display_name: 'Actor', role_level: 'admin' }, workspace_id: 'workspace' });
      if (url === '/managed-systems') return json({ items: [managedSystem(MS_ONE, 'Identity'), managedSystem(MS_TWO, 'Finance')], total: 2 });
      if (url.startsWith('/nav/counts')) return json({ counts: { 'voc.inbox': 0 } });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><AppFrame activeDomain="voc" sidebarEntries={[{ id: 'inbox', label: 'Inbox', href: '/vocs?view=inbox', countKey: 'voc.inbox' }]}>content</AppFrame></QueryClientProvider>);
    await waitFor(() => expect(requestedUrls).toContain('/managed-systems'));
    fireEvent.click(screen.getByTestId('scope-selector'));
    fireEvent.click(await screen.findByTestId(`scope-option-${MS_TWO}`));
    await waitFor(() => expect(requestedUrls).toContain(`/nav/counts?managed_system_id=${MS_TWO}`));
    globalThis.fetch = originalFetch;
  });

  it('renders non-admin scope options when /me omits actor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/me') return json({});
      if (url === '/managed-systems') return json({ items: [managedSystem(MS_ONE, 'Identity'), managedSystem(MS_TWO, 'Finance')], total: 2 });
      if (url === '/nav/counts') return json({ counts: {} });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    try {
      render(<QueryClientProvider client={client}><AppFrame activeDomain="voc" sidebarEntries={[]}>content</AppFrame></QueryClientProvider>);

      await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('scope-selector'));

      expect(screen.getByTestId('scope-union-badge')).toHaveTextContent('union');
      expect(screen.getByTestId('scope-option-all')).toHaveTextContent('union · 0 systems');
      expect(await screen.findByTestId(`scope-option-${MS_ONE}`)).toBeInTheDocument();
      expect(await screen.findByTestId(`scope-option-${MS_TWO}`)).toBeInTheDocument();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function json(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }
function managedSystem(id: string, name: string) { return { id, workspace_id: 'workspace', slug: name.toLowerCase(), name, external_key: null, default_owner_actor_id: null, default_owner_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }; }
