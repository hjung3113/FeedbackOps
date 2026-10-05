import { describe, expect, it } from 'vitest';
import { cn } from '../cn.js';

// Theme keys from styles/theme.css must merge like the Tailwind scale they extend (#782).
describe('cn with FeedbackOps theme keys', () => {
  it.each([
    ['text-caption', 'text-text-muted'],
    ['text-tiny', 'text-text-muted'],
    ['text-micro', 'text-text-muted'],
    ['text-md', 'text-text-muted'],
  ])('keeps the font size %s next to the text color %s', (size, color) => {
    expect(cn(size, color)).toBe(`${size} ${color}`);
  });

  it.each([
    ['text-caption', 'text-xs'],
    ['text-md', 'text-sm'],
    ['leading-body', 'leading-none'],
    ['leading-relaxed-ui', 'leading-none'],
    ['leading-note', 'leading-none'],
    ['tracking-kicker', 'tracking-wide'],
    ['tracking-kind-label', 'tracking-wide'],
    ['rounded-icon-chip', 'rounded-md'],
    ['w-row-accent', 'w-2'],
    ['min-h-row-default', 'min-h-14'],
    ['min-h-row-expanded', 'min-h-24'],
  ])('%s is replaced by a later %s', (first, later) => {
    expect(cn(first, later)).toBe(later);
  });
});
