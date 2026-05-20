// InternalCommentToolbar.test.tsx — TDD RED
// Tests:
//   1. renders Bold, Italic, Code, List, Link, @Mention buttons;
//      Attach button renders but is disabled
//
// C5.4 of slice3 #21.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as React from 'react';

import { InternalCommentToolbar } from '../InternalCommentToolbar';

describe('<InternalCommentToolbar>', () => {
  it('renders Bold, Italic, Code, List, Link, @Mention; Attach is disabled', () => {
    render(<InternalCommentToolbar editor={null} onInsertMention={() => {}} />);

    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Code')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet list')).toBeInTheDocument();
    expect(screen.getByTitle('Link')).toBeInTheDocument();
    expect(screen.getByTitle('@Mention')).toBeInTheDocument();

    const attachBtn = screen.getByTitle('Attach file');
    expect(attachBtn).toBeInTheDocument();
    expect(attachBtn).toBeDisabled();
  });
});
