import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFilterBar } from '../ActiveFilterBar.js';

describe('ActiveFilterBar', () => {
  it('renders nothing when no filters apply', () => {
    const { container } = render(<ActiveFilterBar items={[]} onClearAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('names each remove control and clears the filters through callbacks', () => {
    const remove = vi.fn();
    const clear = vi.fn();
    render(
      <ActiveFilterBar
        items={[{ key: 'area', label: 'Analytics Area: 미지정', onRemove: remove }]}
        onClearAll={clear}
      />,
    );
    expect(screen.getByRole('group', { name: '적용된 필터' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics Area: 미지정 필터 제거' }));
    expect(remove).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(clear).toHaveBeenCalledOnce();
  });
});
