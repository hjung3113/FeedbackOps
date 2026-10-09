import { describe, expect, it } from 'vitest';
import { searchDebounceMs } from '../search-debounce';

describe('searchDebounceMs', () => {
  it.each([
    { draft: '로그이', delayMs: 700 },
    { draft: 'ㄹ', delayMs: 700 },
    { draft: 'voc-02', delayMs: 300 },
    { draft: '로그인 ', delayMs: 300 },
    { draft: '', delayMs: 300 },
  ])('waits $delayMs ms for "$draft"', ({ draft, delayMs }) => {
    expect(searchDebounceMs(draft)).toBe(delayMs);
  });
});
