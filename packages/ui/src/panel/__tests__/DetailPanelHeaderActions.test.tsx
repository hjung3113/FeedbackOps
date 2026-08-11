/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanelHeaderActions } from '../DetailPanelHeaderActions.js';

// Mock sonner. `toast` is callable and carries `.error`, matching the real API.
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const defaultProps = {
  entityKind: 'voc' as const,
  entityId: 'V-1024',
  copyUrl: 'https://app.example.com/vocs/V-1024',
};

// `vi.stubGlobal('navigator', ...)` does not take in jsdom — the component keeps
// seeing the real navigator — so shadow the single property under test with an
// own property and drop it again afterwards.
function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // biome-ignore lint/performance/noDelete: removing the shadow restores the real descriptor
  delete (navigator as { clipboard?: unknown }).clipboard;
  // biome-ignore lint/performance/noDelete: same, for the execCommand shim
  delete (document as { execCommand?: unknown }).execCommand;
});

/** Installs exactly the copy mechanisms a case wants available. */
function stubClipboard(options: { writeText?: () => Promise<void>; execCommand?: boolean }) {
  setClipboard(options.writeText ? { writeText: vi.fn(options.writeText) } : undefined);
  if (options.execCommand !== undefined) {
    document.execCommand = vi.fn(() => options.execCommand as boolean);
  }
}

describe('DetailPanelHeaderActions — copy link', () => {
  it('renders copy link button', () => {
    render(<DetailPanelHeaderActions {...defaultProps} />);
    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument();
  });

  it('copies via the Clipboard API and confirms it', async () => {
    // userEvent.setup() installs its own navigator.clipboard stub, so it has to
    // run before this test decides what the clipboard should be.
    const user = userEvent.setup();
    stubClipboard({ writeText: async () => {} });
    const { toast } = await import('sonner');
    render(<DetailPanelHeaderActions {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://app.example.com/vocs/V-1024',
    );
    expect(toast).toHaveBeenCalledWith('링크가 복사되었습니다.');
  });

  it('resolves a route path into a pasteable absolute URL', async () => {
    // The Task panels pass `/tasks?...`; a bare path is not a link anyone can
    // paste anywhere.
    const user = userEvent.setup();
    stubClipboard({ writeText: async () => {} });
    render(<DetailPanelHeaderActions {...defaultProps} copyUrl="/tasks?view=board&param=abc" />);

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] as string;
    expect(copied).toBe(new URL('/tasks?view=board&param=abc', window.location.href).href);
    expect(copied.startsWith('http')).toBe(true);
  });

  it('falls back to execCommand when the Clipboard API is absent', async () => {
    // `navigator.clipboard` is secure-context only, so it is missing whenever
    // the app is served over http from a LAN IP.
    const user = userEvent.setup();
    stubClipboard({ execCommand: true });
    const { toast } = await import('sonner');
    render(<DetailPanelHeaderActions {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(toast).toHaveBeenCalledWith('링크가 복사되었습니다.');
  });

  it('reports failure instead of claiming a copy that never happened', async () => {
    const user = userEvent.setup();
    stubClipboard({ execCommand: false });
    const { toast } = await import('sonner');
    render(<DetailPanelHeaderActions {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    expect(toast).not.toHaveBeenCalledWith('링크가 복사되었습니다.');
    expect(toast.error).toHaveBeenCalledWith(
      '링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.',
    );
  });

  it('reports failure when nothing can copy at all', async () => {
    const user = userEvent.setup();
    stubClipboard({});
    const { toast } = await import('sonner');
    render(<DetailPanelHeaderActions {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    expect(toast).not.toHaveBeenCalledWith('링크가 복사되었습니다.');
    expect(toast.error).toHaveBeenCalled();
  });

  it('falls back when the Clipboard API rejects', async () => {
    const user = userEvent.setup();
    stubClipboard({
      writeText: async () => {
        throw new Error('permission denied');
      },
    });
    document.execCommand = vi.fn(() => true);
    const { toast } = await import('sonner');
    render(<DetailPanelHeaderActions {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    expect(document.execCommand).toHaveBeenCalledWith('copy');
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
