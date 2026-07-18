import type { VocDetailEnvelope } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SimilarVocSection } from '../SimilarVocSection';

const similar = {
  items: [
    {
      id: '00000000-0000-0000-0000-000000000002',
      display_id: 'VOC-0002',
      title: '첫 번째 유사 VOC',
      reporter_facing_status: 'reviewing',
      severity: 'high',
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      display_id: 'VOC-0003',
      title: '두 번째 유사 VOC',
      reporter_facing_status: 'received',
      severity: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      display_id: 'VOC-0004',
      title: '세 번째 유사 VOC',
      reporter_facing_status: 'assigned',
      severity: 'medium',
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      display_id: 'VOC-0005',
      title: '렌더링하면 안 되는 네 번째 VOC',
      reporter_facing_status: 'progress',
      severity: 'low',
    },
  ],
} satisfies VocDetailEnvelope['similar'];

describe('<SimilarVocSection>', () => {
  it('renders the Similarity count badge and up to three peer rows', () => {
    render(<SimilarVocSection similar={similar} similarCount={4} onSelect={vi.fn()} />);

    expect(screen.getByText('유사 VOC')).toBeInTheDocument();
    expect(screen.getByText('Similarity 4')).toBeInTheDocument();
    expect(screen.getByText('VOC-0002')).toBeInTheDocument();
    expect(screen.getByText('첫 번째 유사 VOC')).toBeInTheDocument();
    expect(screen.getByText('높음')).toBeInTheDocument();
    expect(screen.getByText('VOC-0004')).toBeInTheDocument();
    expect(screen.queryByText('렌더링하면 안 되는 네 번째 VOC')).not.toBeInTheDocument();
  });

  it('selects the clicked peer VOC', () => {
    const onSelect = vi.fn();
    render(<SimilarVocSection similar={similar} similarCount={4} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /VOC-0002 첫 번째 유사 VOC/i }));

    expect(onSelect).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000002');
  });

  it.each([
    ['similar is absent', undefined, 2],
    ['items are empty', { items: [] }, 0],
  ] as Array<[string, VocDetailEnvelope['similar'] | undefined, number]>)('renders nothing when %s', (_description, section, similarCount) => {
    const { container } = render(
      <SimilarVocSection similar={section} similarCount={similarCount} onSelect={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
