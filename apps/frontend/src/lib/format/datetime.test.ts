import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatRelativeTime,
  formatShortDate,
  formatShortDateTime,
  formatTime,
} from '@/lib/format/datetime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-01T06:05:00.000Z');

beforeEach(() => {
  vi.stubEnv('TZ', 'Asia/Seoul');
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('formatRelativeTime', () => {
  it.each([
    { input: '2026-10-01T05:50:00.000Z', expected: '15분 전' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatRelativeTime(input)).toBe(expected);
  });
});

describe('formatDate', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '2026. 10. 1.' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatDate(input)).toBe(expected);
  });
});

describe('formatShortDate', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '10월 1일' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatShortDate(input)).toBe(expected);
  });
});

describe('formatDateTime', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '2026. 10. 1. 오후 3:05' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatDateTime(input)).toBe(expected);
  });
});

describe('formatShortDateTime', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '10월 1일 오후 3:05' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatShortDateTime(input)).toBe(expected);
  });
});

describe('formatTime', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '오후 3:05' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe('formatDateOnly', () => {
  it.each([
    // Date-only values represent their calendar day at midnight UTC; they must not shift a day.
    { input: '2026-10-01', expected: '2026. 10. 1.' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatDateOnly(input)).toBe(expected);
  });
});
