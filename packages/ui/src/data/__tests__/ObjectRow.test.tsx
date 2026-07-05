/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ObjectRow } from '../ObjectRow.js';

describe('ObjectRow', () => {
  it('renders title and mono id', () => {
    const { container } = render(<ObjectRow id="VOC-1042" title="권한 요청이 반복됩니다" />);

    expect(screen.getByText('권한 요청이 반복됩니다')).toBeInTheDocument();
    expect(screen.getByText('VOC-1042')).toHaveClass('font-mono', 'text-text-muted');
    expect(container.firstElementChild).toHaveClass('grid');
  });

  it('renders selected accent bar and selected background', () => {
    const { container } = render(<ObjectRow selected title="선택된 행" />);

    expect(container.firstElementChild).toHaveClass('bg-surface-row-selected');
    expect(screen.getByTestId('object-row-selected-bar')).toHaveClass('bg-border-selected');
  });

  it('renders a token-backed severity bar', () => {
    const { container } = render(<ObjectRow severity="critical" title="긴급 VOC" />);

    const severityBar = container.querySelector('[data-token="--severity-critical"]');
    expect(severityBar).not.toBeNull();
  });

  it('fires onClick from the row', () => {
    const handleClick = vi.fn();
    render(<ObjectRow title="클릭 가능한 행" onClick={handleClick} />);

    fireEvent.click(screen.getByText('클릭 가능한 행'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders trailing and badges slots', () => {
    render(
      <ObjectRow
        title="슬롯 행"
        badges={<span>High</span>}
        trailing={<button type="button">Open</button>}
      />,
    );

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });
});
