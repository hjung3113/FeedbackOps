import { describe, expect, it } from 'vitest';
import { scopeMark, scopeMarkColor, scopeMarkLabel } from './scopeMark';

describe('scopeMarkColor', () => {
  it('is deterministic for the same slug', () => {
    expect(scopeMarkColor('tableau')).toBe(scopeMarkColor('tableau'));
  });

  it('returns a hex from the palette', () => {
    expect(scopeMarkColor('power-bi')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('distinguishes most distinct slugs', () => {
    const colors = ['tableau', 'powerbi', 'looker', 'metabase'].map(scopeMarkColor);
    // Not guaranteed unique across 8 buckets, but these four should not all collide.
    expect(new Set(colors).size).toBeGreaterThan(1);
  });
});

describe('scopeMarkLabel', () => {
  it('uses first letters of the first two words', () => {
    expect(scopeMarkLabel('Power BI')).toBe('PB');
  });

  it('falls back to first two chars of a single word', () => {
    expect(scopeMarkLabel('Tableau')).toBe('TA');
  });

  it('passes Hangul through (no uppercase change)', () => {
    expect(scopeMarkLabel('김지원')).toBe('김지');
  });

  it('handles empty/whitespace', () => {
    expect(scopeMarkLabel('   ')).toBe('?');
  });
});

describe('scopeMark', () => {
  it('combines color + label', () => {
    const m = scopeMark('tableau', 'Tableau');
    expect(m.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(m.label).toBe('TA');
  });
});
