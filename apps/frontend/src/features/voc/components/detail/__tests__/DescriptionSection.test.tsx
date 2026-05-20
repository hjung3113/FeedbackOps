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

import { DescriptionSection } from '../DescriptionSection';
import { DETAIL_ENVELOPE } from './_fixtures';

describe('<DescriptionSection>', () => {
  it('renders section title', () => {
    render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />);
    expect(screen.getByText('설명')).toBeInTheDocument();
  });

  it('renders RichContentRenderer', () => {
    render(<DescriptionSection voc={DETAIL_ENVELOPE} isReporterOnOwnVoc={false} />);
    expect(screen.getByTestId('rich-content-renderer')).toBeInTheDocument();
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
