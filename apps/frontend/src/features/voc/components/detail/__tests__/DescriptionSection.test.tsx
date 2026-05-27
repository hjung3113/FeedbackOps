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

  // ── PLAN-22 §Bug-1 (2026-05-22): attachment chip rendering ─────────────────
  describe('attachment chips', () => {
    const ATTACHMENT_A = {
      id: 'aaaa1111-0000-4000-8000-000000000001',
      name: 'test.png',
      size_bytes: 2048,
      mime_type: 'image/png',
      uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
      created_at: '2026-05-22T10:00:00.000Z',
      linked_at: '2026-05-22T10:00:00.000Z',
    };
    const ATTACHMENT_B = {
      id: 'aaaa1111-0000-4000-8000-000000000002',
      name: 'spec.pdf',
      size_bytes: 12345,
      mime_type: 'application/pdf',
      uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
      created_at: '2026-05-22T10:01:00.000Z',
      linked_at: '2026-05-22T10:01:00.000Z',
    };

    it('renders an AttachmentChip per item in voc.attachments', () => {
      const envelope = {
        ...DETAIL_ENVELOPE,
        attachments: [ATTACHMENT_A, ATTACHMENT_B],
      };
      render(<DescriptionSection voc={envelope} isReporterOnOwnVoc={false} />);
      const chips = screen.getAllByTestId('attachment-chip');
      expect(chips).toHaveLength(2);
      expect(screen.getByText('test.png')).toBeInTheDocument();
      expect(screen.getByText('spec.pdf')).toBeInTheDocument();
    });

    it('renders no chip list when attachments is empty', () => {
      render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />);
      expect(screen.queryByTestId('attachment-chip-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('attachment-chip')).not.toBeInTheDocument();
    });

    it('chip is an anchor whose href targets GET /attachments/:id/download', () => {
      const envelope = {
        ...DETAIL_ENVELOPE,
        attachments: [ATTACHMENT_A],
      };
      render(<DescriptionSection voc={envelope} isReporterOnOwnVoc={false} />);
      const chip = screen.getByTestId('attachment-chip') as HTMLAnchorElement;
      expect(chip.tagName).toBe('A');
      // jsdom resolves relative href against document base; assert via getAttribute
      // to compare the literal route the BE expects.
      expect(chip.getAttribute('href')).toBe(`/attachments/${ATTACHMENT_A.id}/download`);
      expect(chip.getAttribute('download')).toBe(ATTACHMENT_A.name);
    });
  });
});
