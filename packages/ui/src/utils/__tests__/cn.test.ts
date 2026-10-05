import { describe, expect, it } from 'vitest';
import { cn } from '../cn.js';

// Theme keys from styles/theme.css must merge like the Tailwind scale they extend (#782).
describe('cn with FeedbackOps theme keys', () => {
  it.each([
    ['text-caption', 'text-text-muted'],
    ['text-tiny', 'text-text-muted'],
    ['text-micro', 'text-text-muted'],
  ])('keeps the font size %s next to the text color %s', (size, color) => {
    expect(cn(size, color)).toBe(`${size} ${color}`);
  });

  it.each([
    ['text-caption', 'text-xs'],
    ['leading-body', 'leading-none'],
    ['tracking-kicker', 'tracking-wide'],
    ['tracking-kind-label', 'tracking-wide'],
    ['rounded-icon-chip', 'rounded-md'],
    ['w-row-accent', 'w-2'],
  ])('%s is replaced by a later %s', (first, later) => {
    expect(cn(first, later)).toBe(later);
  });
});
