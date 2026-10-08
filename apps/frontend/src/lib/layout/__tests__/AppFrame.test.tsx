import { DetailPanelHeader, ListShell } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
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
const CLOSE_PANEL_EVENT = 'app-frame-test-close-panel';

function dispatchClosePanel() {
  window.dispatchEvent(new Event(CLOSE_PANEL_EVENT));
}

const PANEL_WITH_HEADER = (
  <div data-testid="header-panel">
    <DetailPanelHeader kind="voc" id="VOC-A" onClose={dispatchClosePanel} />
  </div>
);
const PANEL_ESCAPE_PREVENTED = (
  <div data-testid="escape-prevented-panel">
    <button
      type="button"
      data-testid="prevent-escape"
      aria-label="Prevent Escape"
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.preventDefault();
      }}
    />
    <DetailPanelHeader kind="voc" id="VOC-B" onClose={dispatchClosePanel} />
  </div>
);
const PANEL_CLOSE_FIRST = (
  <div data-testid="close-first-panel">
    <DetailPanelHeader kind="voc" id="VOC-C1" onClose={dispatchClosePanel} />
  </div>
);
const PANEL_CLOSE_NEXT = (
  <div data-testid="close-next-panel">
    <DetailPanelHeader kind="voc" id="VOC-C2" onClose={dispatchClosePanel} />
  </div>
);
const PANEL_ROUTE_A = (
  <div data-testid="route-panel-a">
    <DetailPanelHeader kind="voc" id="VOC-D1" onClose={dispatchClosePanel} />
  </div>
);
// Records data-expanded in the commit that first shows route B's panel, before
// passive effects run, so an effect-based reset cannot hide an expanded frame.
const routeBFirstCommitExpanded: Array<string | null> = [];
function FirstCommitProbe() {
  React.useLayoutEffect(() => {
    routeBFirstCommitExpanded.push(
      document.querySelector('[data-testid="app-detail-slot"]')?.getAttribute('data-expanded') ??
        null,
    );
  }, []);
  return null;
}
const PANEL_ROUTE_B = (
  <div data-testid="route-panel-b">
    <FirstCommitProbe />
    <DetailPanelHeader kind="voc" id="VOC-D2" onClose={dispatchClosePanel} />
  </div>
);
const PANEL_RECORD_A = (
  <div data-testid="record-panel-a">
    <DetailPanelHeader kind="voc" id="VOC-E1" onClose={dispatchClosePanel} />
  </div>
);
const PANEL_RECORD_B = (
  <div data-testid="record-panel-b">
    <DetailPanelHeader kind="voc" id="VOC-E2" onClose={dispatchClosePanel} />
  </div>
);
const originalFetch = globalThis.fetch;

function renderAppFrame(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppFrame activeDomain="voc" sidebarEntries={entries}>
        {children}
      </AppFrame>
    </QueryClientProvider>,
  );
}

function CloseLifecycleHarness({ closedPanel }: { closedPanel: undefined | null }) {
  const [record, setRecord] = React.useState<'first' | 'closed' | 'next'>('first');
  React.useEffect(() => {
    const handleClose = () => setRecord('closed');
    window.addEventListener(CLOSE_PANEL_EVENT, handleClose);
    return () => window.removeEventListener(CLOSE_PANEL_EVENT, handleClose);
  }, []);
  const detailPanel =
    record === 'first' ? PANEL_CLOSE_FIRST : record === 'next' ? PANEL_CLOSE_NEXT : closedPanel;

  return (
    <>
      <button type="button" onClick={() => setRecord('next')}>
        open next record
      </button>
      <AppFrame activeDomain="voc" sidebarEntries={entries}>
        <ListShell
          toolbar={{ title: 'Lifecycle' }}
          list={<div>list</div>}
          {...(detailPanel !== undefined ? { detailPanel } : {})}
        />
      </AppFrame>
    </>
  );
}

function RouteRegistrantHarness() {
  const [showSecondRegistrant, setShowSecondRegistrant] = React.useState(false);

  return (
    <>
      <button type="button" onClick={() => setShowSecondRegistrant(true)}>
        mount second registrant
      </button>
      <AppFrame activeDomain="voc" sidebarEntries={entries}>
        <ListShell
          key="route-a"
          toolbar={{ title: 'A' }}
          list={<div />}
          detailPanel={PANEL_ROUTE_A}
        />
        {showSecondRegistrant && (
          <ListShell
            key="route-b"
            toolbar={{ title: 'B' }}
            list={<div />}
            detailPanel={PANEL_ROUTE_B}
          />
        )}
      </AppFrame>
    </>
  );
}

function RecordChangeHarness() {
  const [record, setRecord] = React.useState<'a' | 'b'>('a');

  return (
    <>
      <button type="button" onClick={() => setRecord('b')}>
        switch record
      </button>
      <AppFrame activeDomain="voc" sidebarEntries={entries}>
        <ListShell
          toolbar={{ title: 'Record change' }}
          list={<div />}
          detailPanel={record === 'a' ? PANEL_RECORD_A : PANEL_RECORD_B}
        />
      </AppFrame>
    </>
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/me')
      return json({
        actor: {
          id: 'actor',
          external_id: 'actor',
          email: 'actor@test',
          display_name: 'Actor',
          role_level: 'admin',
        },
        workspace_id: 'workspace',
      });
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
        <AppFrame activeDomain="voc" sidebarEntries={entries}>
          main content
        </AppFrame>
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

  it('toggles the slot fullscreen while keeping the main mounted and hidden', async () => {
    renderAppFrame(
      <ListShell
        toolbar={{ title: 'Inbox' }}
        list={<div>list</div>}
        detailPanel={PANEL_WITH_HEADER}
      />,
    );
    const slot = screen.getByTestId('app-detail-slot');
    const main = screen.getByTestId('app-main');
    await waitFor(() => expect(slot).toHaveAttribute('data-open', 'true'));
    const toggle = screen.getByRole('button', { name: '전체 화면 전환' });

    expect(slot).toHaveAttribute('data-expanded', 'false');
    fireEvent.click(toggle);
    expect(slot).toHaveAttribute('data-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('hidden');

    fireEvent.click(toggle);
    expect(slot).toHaveAttribute('data-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(main).not.toHaveAttribute('hidden');
  });

  it('expanded slot wraps the panel in a centred reading column (#852)', async () => {
    renderAppFrame(
      <ListShell
        toolbar={{ title: 'Inbox' }}
        list={<div>list</div>}
        detailPanel={PANEL_WITH_HEADER}
      />,
    );
    const slot = screen.getByTestId('app-detail-slot');
    await waitFor(() => expect(slot).toHaveAttribute('data-open', 'true'));

    const panelBefore = screen.getByTestId('header-panel');
    const toggle = screen.getByRole('button', { name: '전체 화면 전환' });
    expect(screen.getByTestId('app-detail-slot-column')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(slot).toHaveAttribute('data-expanded', 'true');

    // Toggling must not remount the panel (unsaved input would be lost).
    expect(screen.getByTestId('header-panel')).toBe(panelBefore);
    expect(screen.getByRole('button', { name: '전체 화면 전환' })).toBe(toggle);
    expect(screen.getByTestId('app-detail-slot-column')).toBeInTheDocument();
  });

  it('collapsed slot keeps a layout-neutral column wrapper (#852)', async () => {
    renderAppFrame(
      <ListShell
        toolbar={{ title: 'Inbox' }}
        list={<div>list</div>}
        detailPanel={PANEL_WITH_HEADER}
      />,
    );
    const slot = screen.getByTestId('app-detail-slot');
    await waitFor(() => expect(slot).toHaveAttribute('data-open', 'true'));

    expect(screen.getByTestId('app-detail-slot-column')).toBeInTheDocument();
    expect(screen.getByTestId('header-panel').parentElement).toBe(
      screen.getByTestId('app-detail-slot-column'),
    );
  });

  it.each([
    ['collapsed', false],
    ['expanded', true],
  ])('keeps the aside seam border only while the slot is %s (#862)', async (_label, expand) => {
    renderAppFrame(
      <ListShell
        toolbar={{ title: 'Inbox' }}
        list={<div>list</div>}
        detailPanel={PANEL_WITH_HEADER}
      />,
    );
    const slot = screen.getByTestId('app-detail-slot');
    await waitFor(() => expect(slot).toHaveAttribute('data-open', 'true'));
    if (expand) {
      fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
      expect(slot).toHaveAttribute('data-expanded', 'true');
    }
    if (expand) {
      expect(slot).not.toHaveClass('border-l');
    } else {
      expect(slot).toHaveClass('border-l');
    }
  });

  it('Escape collapses unless a panel handler prevented it', async () => {
    const first = renderAppFrame(
      <ListShell toolbar={{ title: 'Escape' }} list={<div />} detailPanel={PANEL_WITH_HEADER} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('app-detail-slot')).toHaveAttribute('data-open', 'true'),
    );
    fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('app-detail-slot')).toHaveAttribute('data-expanded', 'false');

    first.unmount();
    renderAppFrame(
      <ListShell
        toolbar={{ title: 'Escape prevented' }}
        list={<div />}
        detailPanel={PANEL_ESCAPE_PREVENTED}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('app-detail-slot')).toHaveAttribute('data-open', 'true'),
    );
    fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
    fireEvent.keyDown(screen.getByTestId('prevent-escape'), { key: 'Escape' });
    expect(screen.getByTestId('app-detail-slot')).toHaveAttribute('data-expanded', 'true');
  });

  it.each([
    ['omits the panel', undefined],
    ['passes null', null],
  ])(
    'closing collapses the slot and the next record opens at normal width when the route %s',
    async (_label, closedPanel) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <CloseLifecycleHarness closedPanel={closedPanel} />
        </QueryClientProvider>,
      );
      const slot = screen.getByTestId('app-detail-slot');
      await waitFor(() => expect(screen.getByTestId('close-first-panel')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
      expect(slot).toHaveAttribute('data-expanded', 'true');

      fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
      await waitFor(() => expect(slot).toHaveAttribute('data-open', 'false'));
      expect(slot).toHaveAttribute('data-expanded', 'false');

      fireEvent.click(screen.getByRole('button', { name: 'open next record' }));
      await waitFor(() => expect(screen.getByTestId('close-next-panel')).toBeInTheDocument());
      expect(slot).toHaveAttribute('data-expanded', 'false');
    },
  );

  it('starts a different shell registrant collapsed on its first slot render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RouteRegistrantHarness />
      </QueryClientProvider>,
    );
    const slot = screen.getByTestId('app-detail-slot');
    await waitFor(() => expect(screen.getByTestId('route-panel-a')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
    expect(slot).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'mount second registrant' }));
    expect(await screen.findByTestId('route-panel-b')).toBeInTheDocument();
    expect(slot).toHaveAttribute('data-expanded', 'false');
    expect(routeBFirstCommitExpanded).toEqual(['false']);
    warn.mockRestore();
  });

  it('stays expanded when the same registrant changes its selected record', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RecordChangeHarness />
      </QueryClientProvider>,
    );
    const slot = screen.getByTestId('app-detail-slot');
    await waitFor(() => expect(screen.getByTestId('record-panel-a')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
    expect(slot).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'switch record' }));
    expect(await screen.findByTestId('record-panel-b')).toBeInTheDocument();
    expect(slot).toHaveAttribute('data-expanded', 'true');
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
