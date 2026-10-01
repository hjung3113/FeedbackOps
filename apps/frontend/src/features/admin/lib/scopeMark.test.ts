import { describe, expect, it } from 'vitest';
import { scopeMark, scopeMarkColor, scopeMarkLabel } from './scopeMark';

describe('scopeMarkColor', () => {
  it('is deterministic for the same slug', () => {
    expect(scopeMarkColor('tableau')).toBe(scopeMarkColor('tableau'));
  });

  it('uses the known Managed System token', () => {
    expect(scopeMarkColor('power-bi')).toBe('rgb(var(--managed-system-power-bi) / 1)');
  });

  it('uses the neutral fallback for an unknown slug', () => {
    expect(scopeMarkColor('salesforce')).toBe('rgb(var(--managed-system-default) / 1)');
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
    expect(m.color).toBe('rgb(var(--managed-system-tableau) / 1)');
    expect(m.label).toBe('TA');
  });
});
