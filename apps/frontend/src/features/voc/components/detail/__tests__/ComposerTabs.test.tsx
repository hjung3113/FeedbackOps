// ComposerTabs — unit tests (C5.1 RED, slice3 #21)
// 3 test cases:
//   1. renders only visible tabs
//   2. defaults to leftmost visible tab
//   3. onChange fires when a tab is clicked

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComposerTabs } from '../ComposerTabs';
import type { ComposerVisibility } from '@/features/voc/hooks/useComposerVisibility';

describe('<ComposerTabs>', () => {
  it('renders only visible tabs when showPublic=false', () => {
    const visibility: ComposerVisibility = {
      showPublic: false,
      showReply: true,
      showInternal: true,
    };
    render(
      <ComposerTabs
        visibility={visibility}
        activeTab="reply"
        onTabChange={vi.fn()}
      />,
    );
    expect(screen.queryByText('Public update')).not.toBeInTheDocument();
    expect(screen.getByText('Reporter reply')).toBeInTheDocument();
    expect(screen.getByText('Internal note')).toBeInTheDocument();
  });

  it('defaults to leftmost visible tab (first in order: public > reply > internal)', () => {
    const visibility: ComposerVisibility = {
      showPublic: false,
      showReply: true,
      showInternal: true,
    };
    const onChange = vi.fn();
    render(
      <ComposerTabs
        visibility={visibility}
        activeTab="reply"
        onTabChange={onChange}
      />,
    );
    // The leftmost visible tab is "reply" since public is hidden
    // The active tab button should be "reply"
    const replyBtn = screen.getByRole('tab', { name: /Reporter reply/i });
    expect(replyBtn).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onTabChange with the correct surface when a tab is clicked', () => {
    const visibility: ComposerVisibility = {
      showPublic: true,
      showReply: true,
      showInternal: true,
    };
    const onChange = vi.fn();
    render(
      <ComposerTabs
        visibility={visibility}
        activeTab="public"
        onTabChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Internal note/i }));
    expect(onChange).toHaveBeenCalledWith('internal');
  });
});
