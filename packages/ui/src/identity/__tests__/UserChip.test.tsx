/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { UserChip } from '../UserChip.js';

const mockUser = { display_name: '이유진' };

describe('UserChip — size variants', () => {
  it('sm: renders display_name and avatar uses sm size (h-6 w-6)', () => {
    const { container } = render(
      <UserChip user={mockUser} size="sm" />,
    );
    // Avatar root should carry h-6 w-6 for sm
    expect(container.innerHTML).toContain('h-6');
    expect(container.innerHTML).toContain('w-6');
    // Name text is rendered
    expect(screen.getByText('이유진')).toBeInTheDocument();
  });

  it('md (default): renders display_name and avatar uses md size (h-8 w-8)', () => {
    const { container } = render(
      <UserChip user={mockUser} />,
    );
    // Avatar root should carry h-8 w-8 for md
    expect(container.innerHTML).toContain('h-8');
    expect(container.innerHTML).toContain('w-8');
    // Name text is rendered
    expect(screen.getByText('이유진')).toBeInTheDocument();
  });
});

describe('UserChip — sub prop', () => {
  it('renders sub label when provided', () => {
    render(<UserChip user={mockUser} sub="Reporter" />);
    expect(screen.getByText('Reporter')).toBeInTheDocument();
  });

  it('does not render sub label when undefined', () => {
    const { container } = render(<UserChip user={mockUser} />);
    // No muted second-line element when sub is absent
    const subEl = container.querySelector('.text-xs.text-text-muted');
    expect(subEl).toBeNull();
  });
});

describe('UserChip — unknown user', () => {
  it('renders Korean unknown copy when user is null', () => {
    render(<UserChip user={null} />);
    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
  });

  it('renders Korean unknown copy when user is undefined', () => {
    render(<UserChip user={undefined} />);
    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
  });

  it('renders dashed-border avatar placeholder when user is null', () => {
    const { container } = render(<UserChip user={null} />);
    const dashedEl = container.querySelector('.border-dashed');
    expect(dashedEl).not.toBeNull();
  });

  it('renders dashed-border avatar placeholder when user is undefined', () => {
    const { container } = render(<UserChip user={undefined} />);
    const dashedEl = container.querySelector('.border-dashed');
    expect(dashedEl).not.toBeNull();
  });
});
