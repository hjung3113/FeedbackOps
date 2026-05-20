// ClusterSectionReadOnly.test.tsx — TDD RED test.
// Prototype ref: screen-voc-create.jsx:512-541
// Slice 3: always renders empty state "Cluster 추천은 다음 슬라이스".

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClusterSectionReadOnly } from '../ClusterSectionReadOnly';

describe('ClusterSectionReadOnly', () => {
  it('renders the Slice 3 empty-state copy', () => {
    render(<ClusterSectionReadOnly similarCount={0} />);
    expect(screen.getByText(/Cluster 추천은 다음 슬라이스/i)).toBeInTheDocument();
  });
});
