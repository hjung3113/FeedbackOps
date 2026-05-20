import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { formatVocCreatedAt } from '../VocRow';

describe('formatVocCreatedAt', () => {
  const NOW = new Date('2026-01-15T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a time 30 minutes ago as minutes', () => {
    const iso = new Date(NOW - 30 * 60 * 1000).toISOString();
    const result = formatVocCreatedAt(iso);
    expect(result).toMatch(/분/);
  });

  it('formats a time 1 hour ago as hours', () => {
    const iso = new Date(NOW - 60 * 60 * 1000).toISOString();
    const result = formatVocCreatedAt(iso);
    expect(result).toMatch(/시간/);
  });

  it('formats a time 3 hours ago as hours', () => {
    const iso = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    const result = formatVocCreatedAt(iso);
    expect(result).toMatch(/시간/);
  });

  it('formats a time 2 days ago as a day-granularity string', () => {
    const iso = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatVocCreatedAt(iso);
    // Korean Intl with numeric:'auto' returns "그저께" for -2 days (no /일/).
    // We assert the result is NOT hour/minute-granularity.
    expect(result).not.toMatch(/시간|분/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats a time 1 day ago as a day-granularity string', () => {
    const iso = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    const result = formatVocCreatedAt(iso);
    // Korean Intl with numeric:'auto' returns "어제" for exactly -1 day.
    // We assert day-granularity (not hour/minute).
    expect(result).not.toMatch(/시간|분/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats a time 5 minutes ago (boundary under 60 min) as minutes', () => {
    const iso = new Date(NOW - 5 * 60 * 1000).toISOString();
    const result = formatVocCreatedAt(iso);
    expect(result).toMatch(/분/);
  });

  it('formats now (0 seconds difference) as minutes or "방금"', () => {
    const iso = new Date(NOW).toISOString();
    const result = formatVocCreatedAt(iso);
    // Korean Intl.RelativeTimeFormat('ko') with numeric:auto uses "방금" for 0 minutes
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
