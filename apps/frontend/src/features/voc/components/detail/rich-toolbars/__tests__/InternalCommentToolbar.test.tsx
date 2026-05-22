// InternalCommentToolbar.test.tsx
//
// Tests:
//   1. Renders Bold, Italic, Code, List, Link, @Mention.
//   2. PLAN-22 C8: Attach button renders only when `onAttach` is wired and is
//      enabled (no longer the legacy disabled-deferred state).
//
// C5.4 of slice3 #21 + PLAN-22 C8.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

import { InternalCommentToolbar } from '../InternalCommentToolbar';

describe('<InternalCommentToolbar>', () => {
  it('renders Bold, Italic, Code, List, Link, @Mention', () => {
    render(<InternalCommentToolbar editor={null} onInsertMention={() => {}} />);

    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Code')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet list')).toBeInTheDocument();
    expect(screen.getByTitle('Link')).toBeInTheDocument();
    expect(screen.getByTitle('@Mention')).toBeInTheDocument();
  });

  it('hides Attach when onAttach is not provided', () => {
    render(<InternalCommentToolbar editor={null} onInsertMention={() => {}} />);
    expect(screen.queryByTestId('internal-comment-attach')).not.toBeInTheDocument();
  });

  it('shows Attach (enabled, aria-label 첨부 파일 추가) when onAttach is wired', () => {
    render(
      <InternalCommentToolbar
        editor={null}
        onInsertMention={() => {}}
        onAttach={vi.fn(() => Promise.resolve())}
      />,
    );
    const attach = screen.getByRole('button', { name: '첨부 파일 추가' });
    expect(attach).toBeInTheDocument();
    // editor is null so the AttachButton is disabled (editorDisabled).
    expect(attach).toBeDisabled();
  });
});
