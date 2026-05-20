import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageShell, ListShell, WorkbenchShell, ShellHeader, DetailPanelSlotContext } from '../src/index';

describe('Three-shell taxonomy (ADR-0020)', () => {
  it('PageShell renders with data-shell="page" and 50px header', () => {
    const { container } = render(<PageShell header={{ title: 'Home' }}>body</PageShell>);
    const shell = container.querySelector('[data-shell="page"]');
    expect(shell).toBeInTheDocument();
    const header = container.querySelector('[data-shell-header]');
    expect(header).toBeInTheDocument();
    expect(header?.getAttribute('data-toolbar-height')).toBe('50');
  });

  it('ListShell renders with data-shell="list" and tabs slot', () => {
    const { container } = render(
      <ListShell toolbar={{ title: 'Inbox' }} tabs={<div data-testid="tabs">tabs</div>} list={<ul><li>row</li></ul>} />,
    );
    expect(container.querySelector('[data-shell="list"]')).toBeInTheDocument();
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
    expect(screen.getByText('row')).toBeInTheDocument();
  });

  it('WorkbenchShell renders with data-shell="workbench"', () => {
    const { container } = render(<WorkbenchShell toolbar={{ title: 'Triage' }}>workbench body</WorkbenchShell>);
    expect(container.querySelector('[data-shell="workbench"]')).toBeInTheDocument();
    expect(screen.getByText(/workbench body/)).toBeInTheDocument();
  });
});

describe('ShellHeader 50px rhythm', () => {
  it('every variant has h-toolbar class', () => {
    const { rerender, container } = render(<ShellHeader title="A" />);
    expect(container.querySelector('header')?.className).toContain('h-toolbar');
    rerender(<ShellHeader title="A" variant="toolbar" />);
    expect(container.querySelector('header')?.className).toContain('h-toolbar');
    rerender(<ShellHeader title="A" variant="drawer" />);
    expect(container.querySelector('header')?.className).toContain('h-toolbar');
  });

  it('variant data attribute reflects prop', () => {
    const { rerender, container } = render(<ShellHeader title="A" />);
    expect(container.querySelector('header')?.getAttribute('data-shell-header')).toBe('default');
    rerender(<ShellHeader title="A" variant="toolbar" />);
    expect(container.querySelector('header')?.getAttribute('data-shell-header')).toBe('toolbar');
    rerender(<ShellHeader title="A" variant="drawer" />);
    expect(container.querySelector('header')?.getAttribute('data-shell-header')).toBe('drawer');
  });
});

describe('useDetailPanelSlot forwarding', () => {
  it('shell with detailPanel prop calls slot setContent', () => {
    const setContent = vi.fn();
    const clear = vi.fn();
    render(
      <DetailPanelSlotContext.Provider value={{ setContent, clear }}>
        <ListShell toolbar={{ title: 'I' }} list={<div />} detailPanel={<aside>panel</aside>} />
      </DetailPanelSlotContext.Provider>,
    );
    expect(setContent).toHaveBeenCalledTimes(1);
    const [, node] = setContent.mock.calls[0]!;
    expect(node).toBeDefined();
  });

  it('shell without detailPanel does not call setContent', () => {
    const setContent = vi.fn();
    const clear = vi.fn();
    render(
      <DetailPanelSlotContext.Provider value={{ setContent, clear }}>
        <PageShell header={{ title: 'H' }}>body</PageShell>
      </DetailPanelSlotContext.Provider>,
    );
    expect(setContent).not.toHaveBeenCalled();
  });

  it('shell unmount clears slot', () => {
    const setContent = vi.fn();
    const clear = vi.fn();
    const { unmount } = render(
      <DetailPanelSlotContext.Provider value={{ setContent, clear }}>
        <ListShell toolbar={{ title: 'I' }} list={<div />} detailPanel={<aside>panel</aside>} />
      </DetailPanelSlotContext.Provider>,
    );
    unmount();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
