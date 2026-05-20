/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanelHeaderActions } from '../DetailPanelHeaderActions.js';

// Mock sonner
vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

const defaultProps = {
  entityKind: 'voc' as const,
  entityId: 'V-1024',
  copyUrl: 'https://app.example.com/vocs/V-1024',
};

describe('DetailPanelHeaderActions — copy link', () => {
  it('renders copy link button', () => {
    render(<DetailPanelHeaderActions {...defaultProps} />);
    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument();
  });

  it('fires toast with Korean message when copy button clicked', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    render(<DetailPanelHeaderActions {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '링크 복사' }));
    expect(toast).toHaveBeenCalledWith('링크가 복사되었습니다.');
  });
});

describe('DetailPanelHeaderActions — expand toggle', () => {
  it('renders expand button when onExpandToggle is provided', () => {
    render(<DetailPanelHeaderActions {...defaultProps} onExpandToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '전체 화면 전환' })).toBeInTheDocument();
  });

  it('does not render expand button when onExpandToggle is undefined', () => {
    render(<DetailPanelHeaderActions {...defaultProps} />);
    expect(screen.queryByRole('button', { name: '전체 화면 전환' })).toBeNull();
  });

  it('calls onExpandToggle when expand button clicked', async () => {
    const onExpandToggle = vi.fn();
    const user = userEvent.setup();
    render(<DetailPanelHeaderActions {...defaultProps} onExpandToggle={onExpandToggle} />);
    await user.click(screen.getByRole('button', { name: '전체 화면 전환' }));
    expect(onExpandToggle).toHaveBeenCalledOnce();
  });
});

describe('DetailPanelHeaderActions — kebab dropdown', () => {
  it('renders more button', () => {
    render(<DetailPanelHeaderActions {...defaultProps} />);
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument();
  });

  it('shows deferred menu items after opening dropdown', async () => {
    const user = userEvent.setup();
    render(<DetailPanelHeaderActions {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '더 보기' }));
    expect(screen.getByText('읽음 표시')).toBeInTheDocument();
    expect(screen.getByText('스누즈')).toBeInTheDocument();
    expect(screen.getByText('구독')).toBeInTheDocument();
    expect(screen.getByText('보관')).toBeInTheDocument();
  });

  it('deferred items are disabled', async () => {
    const user = userEvent.setup();
    render(<DetailPanelHeaderActions {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '더 보기' }));
    const item = screen.getByText('읽음 표시');
    // Radix DropdownMenuItem with disabled prop sets aria-disabled
    expect(item.closest('[aria-disabled="true"]') ?? item.closest('[data-disabled]')).not.toBeNull();
  });

  it('renders extraMore slot inside dropdown', async () => {
    const user = userEvent.setup();
    render(
      <DetailPanelHeaderActions
        {...defaultProps}
        extraMore={<div data-testid="extra-more-item">추가 항목</div>}
      />,
    );
    await user.click(screen.getByRole('button', { name: '더 보기' }));
    expect(screen.getByTestId('extra-more-item')).toBeInTheDocument();
  });
});
