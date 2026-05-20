/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanelHeader } from '../DetailPanelHeader.js';
import type { DetailPanelKind } from '../DetailPanelHeader.js';

const KIND_ACCENT: Record<DetailPanelKind, string> = {
  voc:     'var(--color-aether-blue)',
  finding: 'var(--color-emerald)',
  task:    'var(--color-amethyst)',
  survey:  'var(--color-cyan-spark)',
  cluster: 'var(--color-amber)',
};

const kinds = Object.keys(KIND_ACCENT) as DetailPanelKind[];

describe('DetailPanelHeader — kind accent stripe', () => {
  kinds.forEach((kind) => {
    it(`kind="${kind}" sets data-kind attribute`, () => {
      const { container } = render(
        <DetailPanelHeader kind={kind} id="V-1024" onClose={() => {}} />,
      );
      const header = container.querySelector(`[data-kind="${kind}"]`);
      expect(header).not.toBeNull();
    });

    it(`kind="${kind}" accent stripe has correct CSS variable background`, () => {
      const { container } = render(
        <DetailPanelHeader kind={kind} id="V-1024" onClose={() => {}} />,
      );
      // The first child inside the data-kind element is the accent stripe div
      const header = container.querySelector(`[data-kind="${kind}"]`);
      expect(header).not.toBeNull();
      const stripe = header!.querySelector('[aria-hidden="true"]') as HTMLElement | null;
      expect(stripe).not.toBeNull();
      expect(stripe!.style.backgroundColor).toBe(KIND_ACCENT[kind]);
    });
  });
});

describe('DetailPanelHeader — display', () => {
  it('renders the display id', () => {
    render(<DetailPanelHeader kind="voc" id="V-2048" onClose={() => {}} />);
    expect(screen.getByText('V-2048')).toBeInTheDocument();
  });

  it('renders kind label', () => {
    render(<DetailPanelHeader kind="voc" id="V-1" onClose={() => {}} />);
    expect(screen.getByText('VOC')).toBeInTheDocument();
  });

  it('renders extras slot when provided', () => {
    render(
      <DetailPanelHeader
        kind="voc"
        id="V-1"
        onClose={() => {}}
        extras={<span data-testid="extra-slot">extra</span>}
      />,
    );
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument();
  });

  it('does not render extras container when extras is undefined', () => {
    const { container } = render(
      <DetailPanelHeader kind="voc" id="V-1" onClose={() => {}} />,
    );
    expect(container.querySelector('[data-testid="extra-slot"]')).toBeNull();
  });
});

describe('DetailPanelHeader — onClose', () => {
  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DetailPanelHeader kind="voc" id="V-1" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
