/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState.js';

describe('EmptyState — required title', () => {
  it('renders title text', () => {
    render(<EmptyState title="VOC가 없습니다" />);
    expect(screen.getByText('VOC가 없습니다')).toBeInTheDocument();
  });

  it('title has font-medium and text-text-primary classes', () => {
    const { container } = render(<EmptyState title="Test" />);
    const title = container.querySelector('.font-medium.text-text-primary');
    expect(title).not.toBeNull();
  });
});

describe('EmptyState — optional body', () => {
  it('renders body when provided', () => {
    render(<EmptyState title="Empty" body="필터를 변경해보세요" />);
    expect(screen.getByText('필터를 변경해보세요')).toBeInTheDocument();
  });

  it('does not render body paragraph when undefined', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const muted = container.querySelector('.text-text-muted');
    expect(muted).toBeNull();
  });
});

describe('EmptyState — optional icon', () => {
  it('renders icon slot when provided', () => {
    render(
      <EmptyState title="Empty" icon={<span data-testid="icon">📭</span>} />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('does not render icon wrapper when undefined', () => {
    const { container } = render(<EmptyState title="Empty" />);
    // No aria-hidden wrapper for icon
    const iconWrap = container.querySelector('[aria-hidden="true"]');
    expect(iconWrap).toBeNull();
  });
});

describe('EmptyState — optional action', () => {
  it('renders action when provided', () => {
    render(
      <EmptyState title="Empty" action={<button>VOC 만들기</button>} />,
    );
    expect(screen.getByRole('button', { name: 'VOC 만들기' })).toBeInTheDocument();
  });

  it('does not render action wrapper when undefined', () => {
    const { container } = render(<EmptyState title="Empty" />);
    // No button present
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('EmptyState — size variants', () => {
  it('sm: applies py-6 gap-2 text-sm classes', () => {
    const { container } = render(<EmptyState title="Empty" size="sm" />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('py-6');
    expect(root?.className).toContain('gap-2');
    expect(root?.className).toContain('text-sm');
  });

  it('md (default): applies py-12 gap-3 text-base classes', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('py-12');
    expect(root?.className).toContain('gap-3');
    expect(root?.className).toContain('text-base');
  });

  it('lg: applies py-20 gap-4 text-lg classes', () => {
    const { container } = render(<EmptyState title="Empty" size="lg" />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('py-20');
    expect(root?.className).toContain('gap-4');
    expect(root?.className).toContain('text-lg');
  });
});
