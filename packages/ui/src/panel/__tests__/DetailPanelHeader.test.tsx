/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanelHeader } from '../DetailPanelHeader.js';
import type { DetailPanelKind } from '../DetailPanelHeader.js';

// #525: the tokens are raw RGB triplets, so tint CSS needs an `rgb(...)`
// wrapper. The exact tint assertion below catches a bare `var(--color-X)`,
// which jsdom's CSSOM does not validate when reading the style back.
type KindAccent = { token: string; bgClass: string; textClass: string };

const KIND_ACCENT = {
  voc: { token: '--color-aether-blue', bgClass: 'bg-accent-voc', textClass: 'text-accent-voc' },
  finding: {
    token: '--color-emerald',
    bgClass: 'bg-accent-success',
    textClass: 'text-accent-success',
  },
  task: { token: '--color-amethyst', bgClass: 'bg-accent-task', textClass: 'text-accent-task' },
  task_request: {
    token: '--color-amber',
    bgClass: 'bg-accent-warn',
    textClass: 'text-accent-warn',
  },
  survey: {
    token: '--color-cyan-spark',
    bgClass: 'bg-accent-info',
    textClass: 'text-accent-info',
  },
  cluster: { token: '--color-amber', bgClass: 'bg-accent-warn', textClass: 'text-accent-warn' },
  milestone: {
    token: '--color-amber',
    bgClass: 'bg-accent-warn',
    textClass: 'text-accent-warn',
  },
} satisfies Record<DetailPanelKind, KindAccent>;

const KIND_LABELS: Record<DetailPanelKind, string> = {
  voc: 'VOC',
  finding: 'Finding',
  task: 'Task',
  task_request: 'Task Request',
  survey: 'Survey',
  cluster: 'Cluster',
  milestone: 'Milestone',
};

const kinds = Object.keys(KIND_ACCENT) as DetailPanelKind[];

describe('DetailPanelHeader — kind accent stripe', () => {
  for (const kind of kinds) {
    it(`kind="${kind}" sets data-kind attribute`, () => {
      const { container } = render(
        <DetailPanelHeader kind={kind} id="V-1024" onClose={() => {}} />,
      );
      const header = container.querySelector(`[data-kind="${kind}"]`);
      expect(header).not.toBeNull();
    });
  }

  for (const kind of kinds.filter((kind) => kind !== 'milestone')) {
    it(`kind="${kind}" accent stripe uses the kind token class`, () => {
      const { container } = render(
        <DetailPanelHeader kind={kind} id="V-1024" onClose={() => {}} />,
      );
      // The first child inside the data-kind element is the accent stripe div
      const header = container.querySelector(`[data-kind="${kind}"]`);
      expect(header).not.toBeNull();
      const stripe = header?.querySelector('[aria-hidden="true"]') as HTMLElement | null;
      expect(stripe).not.toBeNull();
      expect(stripe).toHaveClass(KIND_ACCENT[kind].bgClass);
    });
  }
});

describe('DetailPanelHeader — milestone kind badge', () => {
  it.each(kinds)('renders kind="%s" as a title-case chip with a dot', (kind) => {
    const { container } = render(<DetailPanelHeader kind={kind} id="ID-1" onClose={() => {}} />);
    const chip = screen.getByText(KIND_LABELS[kind]);

    expect(chip).toHaveClass('rounded');
    expect(chip).toHaveClass('text-tiny');
    expect(chip).toHaveClass(KIND_ACCENT[kind].textClass);
    expect(chip).not.toHaveClass('uppercase');
    const dot = chip.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass(KIND_ACCENT[kind].bgClass);
    const header = container.querySelector(`[data-kind="${kind}"]`) as HTMLElement;
    expect(header.style.getPropertyValue('--detail-panel-kind-tint')).toBe(
      `rgb(var(${KIND_ACCENT[kind].token}) / 0.12)`,
    );
    expect(container.querySelector(`[data-kind="${kind}"]`)).toBeInTheDocument();
  });

  it('renders the rounded title-case badge without a leading stripe', () => {
    const { container } = render(
      <DetailPanelHeader
        kind="milestone"
        id="M-21"
        onClose={() => {}}
        extras={<span data-testid="extra-slot">extra</span>}
      />,
    );

    const header = container.querySelector('[data-kind="milestone"]');
    const badge = screen.getByText('Milestone');

    expect(badge).toHaveClass('rounded');
    expect(badge).toHaveClass('text-tiny');
    expect(badge).not.toHaveClass('uppercase');
    expect((badge as HTMLElement).querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(header?.querySelector(':scope > div[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('M-21')).toBeInTheDocument();
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();
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

  // B2d fixup (#514): panels mount the header before their detail query
  // resolves; without an id the chrome and close action still render and no
  // unavailable record data appears.
  it('renders kind label and close action without an id span when id is omitted', () => {
    const { container } = render(<DetailPanelHeader kind="milestone" onClose={() => {}} />);
    expect(screen.getByText('Milestone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();
    expect(container.querySelector('.font-mono')).toBeNull();
  });

  it('matches prototype panel-header and panel-id typography', () => {
    const { container } = render(<DetailPanelHeader kind="voc" id="V-1" onClose={() => {}} />);
    const header = container.querySelector('[data-kind="voc"]');
    expect(header).toHaveClass('h-toolbar');
    const content = screen.getByTestId('detail-panel-header-content');
    expect(content).toHaveClass('pl-4');
    expect(content).toHaveClass('pr-3');

    const id = screen.getByText('V-1');
    expect(id).toHaveClass('font-mono');
    expect(id).toHaveClass('text-xs');
    expect(id).toHaveClass('text-text-muted');
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
    const { container } = render(<DetailPanelHeader kind="voc" id="V-1" onClose={() => {}} />);
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

  it('omits the close button when no callback is provided', () => {
    render(<DetailPanelHeader kind="survey" id="SRV-1" />);
    expect(screen.queryByRole('button', { name: '패널 닫기' })).not.toBeInTheDocument();
  });
});
