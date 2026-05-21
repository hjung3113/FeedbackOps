import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// RichContentRenderer is a @fops/ui primitive — stub it
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichContentRenderer: ({ doc }: { doc: unknown; mode: string }) => (
      <div data-testid="rich-content-renderer">{String(doc)}</div>
    ),
  };
});

// EditDescriptionModal uses QueryClient + mutation hooks — stub it to isolate DescriptionSection
vi.mock('../EditDescriptionModal', () => ({
  EditDescriptionModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-description-modal" /> : null,
}));

import { DescriptionSection } from '../DescriptionSection';
import { DETAIL_ENVELOPE } from './_fixtures';

const ENVELOPE_WITH_BODY = {
  ...DETAIL_ENVELOPE,
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '실제 내용' }] }],
  },
};

describe('<DescriptionSection>', () => {
  it('renders the BODY section label (English, per .review/title-reference.png)', () => {
    render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />);
    // Per relaxed copy convention (root AGENTS.md): the reference shows
    // 'BODY' in English uppercase. Mirror verbatim.
    expect(screen.getByText('BODY')).toBeInTheDocument();
    // Old Korean label '설명' is removed in favor of the reference.
    expect(screen.queryByText('설명')).not.toBeInTheDocument();
  });

  it('wraps the body in a tinted card (bg-surface-card-elevated) per reference image', () => {
    const { container } = render(
      <DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />,
    );
    // Card element carries the elevated-card token; assertion is on the
    // CSS class hook rather than computed style so it survives JSDOM.
    const card = container.querySelector('[data-testid="description-body-card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toMatch(/bg-surface-card-elevated/);
    expect(card?.className).toMatch(/rounded-md/);
  });

  it('renders RichContentRenderer when description has content', () => {
    render(<DescriptionSection voc={ENVELOPE_WITH_BODY} isReporterOnOwnVoc={false} />);
    expect(screen.getByTestId('rich-content-renderer')).toBeInTheDocument();
  });

  it("renders '설명 없음' fallback when description is empty", () => {
    render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />);
    expect(screen.getByText('설명 없음')).toBeInTheDocument();
    expect(screen.queryByTestId('rich-content-renderer')).not.toBeInTheDocument();
  });

  it("renders '설명 없음' fallback when description has only empty paragraph", () => {
    const envelope = {
      ...DETAIL_ENVELOPE,
      description_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    };
    render(<DescriptionSection voc={envelope} isReporterOnOwnVoc={false} />);
    expect(screen.getByText('설명 없음')).toBeInTheDocument();
  });

  it('shows EditDescriptionLink when isReporterOnOwnVoc is true', () => {
    render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={true} />);
    expect(screen.getByRole('button', { name: '설명 수정' })).toBeInTheDocument();
  });

  it('hides EditDescriptionLink when isReporterOnOwnVoc is false', () => {
    render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />);
    expect(screen.queryByRole('button', { name: '설명 수정' })).not.toBeInTheDocument();
  });
});
