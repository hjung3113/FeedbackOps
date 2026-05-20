// TriageEmpty.test.tsx — RED test for the empty state component.
// Prototype ref: screen-voc-create.jsx:691-697
// TDD RED: this test is written before the implementation file exists.

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TriageEmpty } from '../TriageEmpty';

describe('TriageEmpty', () => {
  it('renders the empty queue message', () => {
    render(<TriageEmpty />);
    expect(screen.getByText('큐가 비었습니다')).toBeInTheDocument();
  });

  it('renders the helper sub-text', () => {
    render(<TriageEmpty />);
    expect(screen.getByText(/새 VOC가 들어오면 자동으로 추가됩니다/)).toBeInTheDocument();
  });
});
