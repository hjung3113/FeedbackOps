import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../src/components/Button';

describe('Button loading + aria-busy contract', () => {
  it('loading=true sets disabled + aria-busy + renders spinner', () => {
    render(<Button loading>Submit</Button>);
    const btn = screen.getByRole('button', { name: /submit/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('svg')).toBeInTheDocument(); // lucide Loader2
  });

  it('asChild without loading renders child element intact', () => {
    render(<Button asChild><a href="/foo">Link</a></Button>);
    const link = screen.getByRole('link', { name: /link/i });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link.querySelector('svg')).not.toBeInTheDocument();
  });

  it('asChild + loading throws in dev', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(() => {
      render(<Button asChild loading><a href="/foo">Link</a></Button>);
    }).toThrow(/loading.*incompatible.*asChild/i);
    process.env.NODE_ENV = originalEnv;
  });

  it('asChild + loading in prod warns + renders child without spinner', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Button asChild loading><a href="/foo">Link</a></Button>);
    const link = screen.getByRole('link', { name: /link/i });
    expect(link).toBeInTheDocument();
    expect(link.querySelector('svg')).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it('variant primary aliases to default (back-compat)', () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('variant subtle aliases to ghost (back-compat)', () => {
    render(<Button variant="subtle">Cancel</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
