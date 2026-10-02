import { describe, expect, it } from 'vitest';
import preset from '../tailwind.preset';

// Issue #672: the preset must wire the Pack 17 typography tokens
// (packages/ui/src/styles/tokens.css) into Tailwind so `font-sans`/`font-mono`
// and the size utilities resolve to tokens instead of Tailwind defaults.
describe('tailwind preset typography mapping', () => {
  it('maps font families to the Pack 17 font tokens', () => {
    expect(preset.theme?.extend?.fontFamily).toEqual({
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    });
  });

  // Tailwind names covered by the token scale. Sizes the documented Type
  // Scale pairs with a leading (body 1.4, heading 1.2) carry it; the rest
  // are size-only like the prototype's .text-* helpers.
  const sizes: Record<
    'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl',
    string | [string, { lineHeight: string }]
  > = {
    xs: 'var(--text-xs)',
    sm: 'var(--text-sm)',
    base: ['var(--text-body)', { lineHeight: 'var(--leading-normal)' }],
    lg: 'var(--text-lg)',
    xl: 'var(--text-xl)',
    '2xl': ['var(--text-heading)', { lineHeight: 'var(--leading-tight)' }],
  };

  it.each(Object.entries(sizes))('maps text-%s to the body-scale token', (name, expected) => {
    expect(preset.theme?.extend?.fontSize?.[name]).toEqual(expected);
  });
});
