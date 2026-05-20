import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DetailPanelNotFound } from '../DetailPanelNotFound';

describe('<DetailPanelNotFound>', () => {
  it('renders the not-found title', () => {
    render(<DetailPanelNotFound onClearSelection={vi.fn()} />);
    expect(screen.getByText('VOC를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('renders the description body', () => {
    render(<DetailPanelNotFound onClearSelection={vi.fn()} />);
    expect(screen.getByText('해당 VOC는 삭제되었거나 접근 권한이 없습니다.')).toBeInTheDocument();
  });

  it('calls onClearSelection when button is clicked', () => {
    const onClear = vi.fn();
    render(<DetailPanelNotFound onClearSelection={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
