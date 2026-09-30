import { describe, expect, it } from 'vitest';

import { formatSameManagedSystemVocCount } from '../voc';

describe('formatSameManagedSystemVocCount', () => {
  it.each([
    [1, '같은 Managed System의 VOC 1건'],
    [2, '같은 Managed System의 VOC 2건'],
    [4, '같은 Managed System의 VOC 4건'],
  ] as Array<[number, string]>)('uses truthful shared copy for %i peers', (count, expected) => {
    expect(formatSameManagedSystemVocCount(count)).toBe(expected);
  });
});
