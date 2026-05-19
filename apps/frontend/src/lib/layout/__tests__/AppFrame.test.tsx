import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ListShell } from '@fops/ui';
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

describe('AppFrame', () => {
  it('renders Rail + Sidebar + Main + collapsed DetailPanelSlot by default', () => {
    render(<AppFrame sidebarEntries={entries}>main content</AppFrame>);
    expect(screen.getByTestId('app-rail')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-main')).toHaveTextContent(/main content/);
    expect(screen.getByTestId('app-detail-slot').getAttribute('data-open')).toBe('false');
  });

  it('renders detail panel when a shell forwards detailPanel', async () => {
    render(
      <AppFrame sidebarEntries={entries}>
        <ListShell
          toolbar={{ title: 'Inbox' }}
          list={<div>list</div>}
          detailPanel={PANEL_CONTENT}
        />
      </AppFrame>,
    );
    // useDetailPanelSlot fires in a useEffect — wait for it to flush
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-slot').getAttribute('data-open')).toBe('true');
    });
    expect(screen.getByTestId('dp-content')).toHaveTextContent(/PANEL/);
  });

  it('warns when two shells register concurrent panels', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <AppFrame sidebarEntries={entries}>
        <ListShell toolbar={{ title: 'A' }} list={<div />} detailPanel={PANEL_A} />
        <ListShell toolbar={{ title: 'B' }} list={<div />} detailPanel={PANEL_B} />
      </AppFrame>,
    );
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[AppFrame]'));
    }, { timeout: 3000 });
    warn.mockRestore();
  });
});
