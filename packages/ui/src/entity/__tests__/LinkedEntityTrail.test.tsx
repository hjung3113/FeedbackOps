/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { LinkedEntityTrail, type EntityNodeRef } from '../LinkedEntityTrail.js';

describe('LinkedEntityTrail — empty state', () => {
  it('renders dashed placeholder when nodes is empty', () => {
    const { container } = render(<LinkedEntityTrail nodes={[]} />);
    const circle = container.querySelector('.border-dashed');
    expect(circle).not.toBeNull();
  });

  it('renders "연결된 엔티티 없음" copy when nodes is empty', () => {
    render(<LinkedEntityTrail nodes={[]} />);
    expect(screen.getByText('연결된 엔티티 없음')).toBeInTheDocument();
  });
});

describe('LinkedEntityTrail — non-empty nodes', () => {
  const mockNodes: EntityNodeRef[] = [
    { type: 'voc', id: 'voc-1', display_id: 'V-001' },
    { type: 'finding', id: 'finding-1', display_id: 'F-001' },
    { type: 'task', id: 'task-1', display_id: 'T-001' },
  ];

  it('renders EntityIconBadge per node', () => {
    const { container } = render(<LinkedEntityTrail nodes={mockNodes} />);
    // EntityIconBadge sets data-entity-type per node type
    expect(container.querySelector('[data-entity-type="voc"]')).not.toBeNull();
    expect(container.querySelector('[data-entity-type="finding"]')).not.toBeNull();
    expect(container.querySelector('[data-entity-type="task"]')).not.toBeNull();
  });

  it('renders → separators between nodes (not after last)', () => {
    render(<LinkedEntityTrail nodes={mockNodes} />);
    const arrows = screen.getAllByText('→');
    // 3 nodes → 2 arrows
    expect(arrows).toHaveLength(2);
  });

  it('does NOT render "연결된 엔티티 없음" when nodes exist', () => {
    render(<LinkedEntityTrail nodes={mockNodes} />);
    expect(screen.queryByText('연결된 엔티티 없음')).toBeNull();
  });

  it('single node → no separator rendered', () => {
    const { container } = render(
      <LinkedEntityTrail nodes={[{ type: 'survey', id: 'survey-1', display_id: 'S-001' }]} />,
    );
    expect(screen.queryByText('→')).toBeNull();
    expect(container.querySelector('[data-entity-type="survey"]')).not.toBeNull();
  });
});
