import { ListShell } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFrame } from '../AppFrame';

const entries = [
  { id: 'inbox', label: 'Inbox', href: '/vocs?view=inbox' },
  { id: 'my', label: 'My VOCs', href: '/vocs?view=my' },
  { id: 'triage', label: 'Triage', href: '/vocs?view=triage' },
  { id: 'create', label: '+ New VOC', href: '/vocs?action=create' },
];

// Stable element constants — must be defined at module scope, not inside render
// callbacks. This prevents useDetailPanelSlot's [ctx, node] dep from seeing a
// new reference on every parent render, which would cause an infinite update loop.
const PANEL_CONTENT = <aside data-testid="dp-content">PANEL</aside>;
const PANEL_A = <aside>A</aside>;
const PANEL_B = <aside>B</aside>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/me') return json({ actor: { id: 'actor', external_id: 'actor', email: 'actor@test', display_name: 'Actor', role_level: 'admin' }, workspace_id: 'workspace' });
    if (url === '/managed-systems') return json({ items: [], total: 0 });
    if (url === '/nav/counts') return json({ counts: {} });
    throw new Error(`unexpected request ${url}`);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('AppFrame', () => {
  it('renders Rail + Sidebar + Main + collapsed DetailPanelSlot by default', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AppFrame activeDomain="voc" sidebarEntries={entries}>main content</AppFrame>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('app-rail')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-main')).toHaveTextContent(/main content/);
    expect(screen.getByTestId('app-detail-slot').getAttribute('data-open')).toBe('false');
  });

  it('renders detail panel when a shell forwards detailPanel', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AppFrame activeDomain="voc" sidebarEntries={entries}>
          <ListShell
            toolbar={{ title: 'Inbox' }}
            list={<div>list</div>}
            detailPanel={PANEL_CONTENT}
          />
        </AppFrame>
      </QueryClientProvider>,
    );
    // useDetailPanelSlot fires in a useEffect — wait for it to flush
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-slot').getAttribute('data-open')).toBe('true');
    });
    expect(screen.getByTestId('dp-content')).toHaveTextContent(/PANEL/);
  });

  it('warns when two shells register concurrent panels', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AppFrame activeDomain="voc" sidebarEntries={entries}>
          <ListShell toolbar={{ title: 'A' }} list={<div />} detailPanel={PANEL_A} />
          <ListShell toolbar={{ title: 'B' }} list={<div />} detailPanel={PANEL_B} />
        </AppFrame>
      </QueryClientProvider>,
    );
    await waitFor(
      () => {
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('[AppFrame]'));
      },
      { timeout: 3000 },
    );
    warn.mockRestore();
  });

  it('DetailPanelSlot override and restore: unmounting B restores A content', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Stable panel elements defined outside JSX to avoid reference churn
    const PANEL_RESTORE_A = <aside data-testid="restore-panel-a">Panel A</aside>;
    const PANEL_RESTORE_B = <aside data-testid="restore-panel-b">Panel B</aside>;

    function TestHarness({ showB }: { showB: boolean }) {
      return (
        <AppFrame activeDomain="voc" sidebarEntries={entries}>
          <ListShell toolbar={{ title: 'Shell A' }} list={<div />} detailPanel={PANEL_RESTORE_A} />
          {showB && (
            <ListShell
              toolbar={{ title: 'Shell B' }}
              list={<div />}
              detailPanel={PANEL_RESTORE_B}
            />
          )}
        </AppFrame>
      );
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <TestHarness showB={true} />
      </QueryClientProvider>,
    );

    // Both A and B registered — slot shows B (last registered)
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-slot').getAttribute('data-open')).toBe('true');
    });

    // Unmount shell B — slot should revert to A
    rerender(
      <QueryClientProvider client={client}>
        <TestHarness showB={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('restore-panel-a')).toBeInTheDocument();
      expect(screen.queryByTestId('restore-panel-b')).not.toBeInTheDocument();
    });

    warn.mockRestore();
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
