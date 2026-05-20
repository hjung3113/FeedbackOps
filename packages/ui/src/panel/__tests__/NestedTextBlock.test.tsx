/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { NestedTextBlock } from '../NestedTextBlock.js';

describe('NestedTextBlock', () => {
  it('renders children content', () => {
    render(<NestedTextBlock>설명 본문입니다.</NestedTextBlock>);
    expect(screen.getByText('설명 본문입니다.')).toBeInTheDocument();
  });

  it('has rounded-md border class', () => {
    const { container } = render(<NestedTextBlock>내용</NestedTextBlock>);
    expect(container.firstElementChild).toHaveClass('rounded-md');
  });

  it('has bg-surface-canvas class', () => {
    const { container } = render(<NestedTextBlock>내용</NestedTextBlock>);
    expect(container.firstElementChild).toHaveClass('bg-surface-canvas');
  });

  it('applies custom className', () => {
    const { container } = render(
      <NestedTextBlock className="extra-class">내용</NestedTextBlock>,
    );
    expect(container.firstElementChild).toHaveClass('extra-class');
  });

  it('renders nested elements correctly', () => {
    render(
      <NestedTextBlock>
        <p data-testid="inner">내부 단락</p>
      </NestedTextBlock>,
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });
});
