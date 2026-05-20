/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { PanelTitleBlock } from '../PanelTitleBlock.js';

describe('PanelTitleBlock', () => {
  it('renders title text', () => {
    render(<PanelTitleBlock title="VOC 제목" />);
    expect(screen.getByText('VOC 제목')).toBeInTheDocument();
  });

  it('renders as h2 for correct heading hierarchy', () => {
    render(<PanelTitleBlock title="제목 테스트" />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('renders badges slot when provided', () => {
    render(
      <PanelTitleBlock
        title="제목"
        badges={
          <>
            <span data-testid="badge-a">badge A</span>
            <span data-testid="badge-b">badge B</span>
          </>
        }
      />,
    );
    expect(screen.getByTestId('badge-a')).toBeInTheDocument();
    expect(screen.getByTestId('badge-b')).toBeInTheDocument();
  });

  it('does not render badges wrapper when badges is undefined', () => {
    const { container } = render(<PanelTitleBlock title="제목" />);
    // only 1 child div (the h2 wrapper); no badges row
    const children = container.firstElementChild?.children;
    expect(children?.length).toBe(1);
  });

  it('applies custom className', () => {
    const { container } = render(<PanelTitleBlock title="x" className="custom-cls" />);
    expect(container.firstElementChild).toHaveClass('custom-cls');
  });
});
