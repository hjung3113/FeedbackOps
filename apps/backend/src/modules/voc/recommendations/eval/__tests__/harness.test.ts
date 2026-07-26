// #168 step 5 — arithmetic of the evaluation harness (ADR-0034 D5).
//
// Every expected number here is hand-computed in the comment beside it, never
// copied from a run. An eval harness that is checked against its own output
// blesses whatever denominator it happens to use, and the whole point of the
// fixture is that it is allowed to say the recommender is wrong.

import { describe, expect, it } from 'vitest';

import { type EvalFixture, assertFixtureWellFormed } from '../fixture.js';
import { cosineSimilarity, evaluateFixture, metricsFrom, predictLabel } from '../harness.js';

describe('cosineSimilarity (#168)', () => {
  it('returns 1 for identical direction and 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 12);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 12);
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 12);
  });

  it('normalizes, so a scaled vector has the same similarity', () => {
    // [4,3,0] against the x axis: 4 / sqrt(4²+3²) = 4/5 = 0.8, for any scale.
    expect(cosineSimilarity([1, 0, 0], [4, 3, 0])).toBeCloseTo(0.8, 12);
    expect(cosineSimilarity([1, 0, 0], [400, 300, 0])).toBeCloseTo(0.8, 12);
    expect(cosineSimilarity([10, 0, 0], [4, 3, 0])).toBeCloseTo(0.8, 12);
  });

  it('is symmetric', () => {
    expect(cosineSimilarity([55, 48, 0], [1, 0, 0])).toBeCloseTo(
      cosineSimilarity([1, 0, 0], [55, 48, 0]),
      12,
    );
  });

  it('refuses mismatched dimensions and zero vectors rather than returning a number', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/equal dimensions/);
    expect(() => cosineSimilarity([0, 0, 0], [1, 0, 0])).toThrow(/zero vector/);
    expect(() => cosineSimilarity([1, 0, 0], [0, 0, 0])).toThrow(/zero vector/);
  });
});

describe('predictLabel (#168)', () => {
  it('treats a similarity exactly at the cut as related, matching the SQL `score >= threshold`', () => {
    expect(predictLabel(0.75, 0.75)).toBe('related');
    expect(predictLabel(0.7500001, 0.75)).toBe('related');
    expect(predictLabel(0.7499999, 0.75)).toBe('unrelated');
  });
});

describe('metricsFrom (#168)', () => {
  it('computes precision, recall and F1 from hand-counted cells', () => {
    // tp=4 fp=2 fn=1: precision 4/(4+2) = 2/3 ≈ 0.666667,
    //                 recall    4/(4+1) = 4/5 = 0.8,
    //                 F1        2·4/(2·4+2+1) = 8/11 ≈ 0.727273.
    // The three differ, so a swapped denominator cannot coincide with them.
    const metrics = metricsFrom({ tp: 4, fp: 2, tn: 6, fn: 1 });
    expect(metrics.precision).toBeCloseTo(2 / 3, 12);
    expect(metrics.recall).toBeCloseTo(0.8, 12);
    expect(metrics.f1).toBeCloseTo(8 / 11, 12);
  });

  it('computes a second, differently shaped set', () => {
    // tp=3 fp=1 fn=6: precision 3/4 = 0.75, recall 3/9 = 1/3,
    //                 F1 = 2·3/(2·3+1+6) = 6/13 ≈ 0.461538.
    const metrics = metricsFrom({ tp: 3, fp: 1, tn: 5, fn: 6 });
    expect(metrics.precision).toBeCloseTo(0.75, 12);
    expect(metrics.recall).toBeCloseTo(1 / 3, 12);
    expect(metrics.f1).toBeCloseTo(6 / 13, 12);
  });

  it('ignores true negatives entirely', () => {
    // None of the three metrics has tn in it; a harness that leaked tn into a
    // denominator (accuracy by mistake) would move here and nowhere else.
    const few = metricsFrom({ tp: 4, fp: 2, tn: 0, fn: 1 });
    const many = metricsFrom({ tp: 4, fp: 2, tn: 9999, fn: 1 });
    expect(few).toEqual(many);
  });

  it('reports null, not 0 or 1, when nothing was predicted related', () => {
    const metrics = metricsFrom({ tp: 0, fp: 0, tn: 5, fn: 3 });
    expect(metrics.precision).toBeNull(); // 0/0 — no predicted positives.
    expect(metrics.recall).toBe(0); // 0/3 — well defined, and genuinely zero.
    expect(metrics.f1).toBeNull();
  });

  it('reports null when nothing was labelled related', () => {
    const metrics = metricsFrom({ tp: 0, fp: 2, tn: 5, fn: 0 });
    expect(metrics.precision).toBe(0); // 0/2 — well defined.
    expect(metrics.recall).toBeNull(); // 0/0 — no actual positives.
    expect(metrics.f1).toBeNull();
  });

  it('reports null for every metric when both denominators are empty', () => {
    expect(metricsFrom({ tp: 0, fp: 0, tn: 5, fn: 0 })).toEqual({
      precision: null,
      recall: null,
      f1: null,
    });
  });

  it('returns null rather than NaN when precision and recall are both zero', () => {
    // 2·0·0/(0+0) is 0/0. Without the guard this is NaN, which compares
    // unequal to everything and would quietly pass a `not.toBe(1)` assertion.
    const metrics = metricsFrom({ tp: 0, fp: 1, tn: 0, fn: 1 });
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBeNull();
  });
});

describe('evaluateFixture (#168)', () => {
  // A tiny fixture whose every cell is hand-derivable, independent of the
  // shipped one, so a mistake in the real fixture cannot mask a harness bug.
  const tiny: EvalFixture = {
    thresholdPin: 0.5,
    vectorSource: { provenance: 'hand-authored-synthetic', dimensions: 3, note: 'test-local' },
    items: [
      { key: 's', title: 'source', body: '', vector: [1, 0, 0] },
      { key: 'hit', title: 'hit', body: '', vector: [4, 3, 0] }, // 0.8
      { key: 'miss', title: 'miss', body: '', vector: [3, 4, 0] }, // 0.6
      { key: 'far', title: 'far', body: '', vector: [0, 1, 0] }, // 0.0
    ],
    pairs: [
      {
        source: 's',
        candidate: 'hit',
        expected: 'related',
        band: 'clear',
        expectedSimilarity: 0.8,
        note: 'tp',
      },
      {
        source: 's',
        candidate: 'miss',
        expected: 'unrelated',
        band: 'clear',
        expectedSimilarity: 0.6,
        note: 'fp',
      },
      {
        source: 's',
        candidate: 'far',
        expected: 'related',
        band: 'clear',
        expectedSimilarity: 0,
        note: 'fn',
      },
    ],
    expectedAtPin: { truePositives: 1, falsePositives: 1, trueNegatives: 0, falseNegatives: 1 },
  };

  it('classifies each pair into the cell hand-derived above', () => {
    const report = evaluateFixture(tiny, 0.5);
    expect(report.pairs.map((pair) => pair.cell)).toEqual(['tp', 'fp', 'fn']);
    expect(report.counts).toEqual({ tp: 1, fp: 1, tn: 0, fn: 1 });
    // precision 1/2, recall 1/2, F1 2·1/(2+1+1) = 1/2.
    expect(report.precision).toBeCloseTo(0.5, 12);
    expect(report.recall).toBeCloseTo(0.5, 12);
    expect(report.f1).toBeCloseTo(0.5, 12);
  });

  it('moves cells when the cut moves', () => {
    // At 0.9 nothing is predicted related: tp=0 fp=0 fn=2 tn=1.
    const strict = evaluateFixture(tiny, 0.9);
    expect(strict.counts).toEqual({ tp: 0, fp: 0, tn: 1, fn: 2 });
    expect(strict.precision).toBeNull();
    expect(strict.recall).toBe(0);

    // At 0.0 everything is: tp=2 fp=1 fn=0 tn=0.
    const loose = evaluateFixture(tiny, 0);
    expect(loose.counts).toEqual({ tp: 2, fp: 1, tn: 0, fn: 0 });
    expect(loose.precision).toBeCloseTo(2 / 3, 12);
    expect(loose.recall).toBe(1);
  });

  it('reports the similarity it scored, not just the verdict', () => {
    const report = evaluateFixture(tiny, 0.5);
    expect(report.pairs.map((pair) => pair.similarity)).toEqual([
      expect.closeTo(0.8, 12),
      expect.closeTo(0.6, 12),
      expect.closeTo(0, 12),
    ]);
  });

  it('refuses a malformed fixture instead of scoring what survives', () => {
    const dangling: EvalFixture = {
      ...tiny,
      pairs: [{ ...(tiny.pairs[0] as EvalFixture['pairs'][number]), candidate: 'nope' }],
      expectedAtPin: { truePositives: 1, falsePositives: 0, trueNegatives: 0, falseNegatives: 0 },
    };
    expect(() => evaluateFixture(dangling, 0.5)).toThrow(/unknown candidate/);

    const wrongDimensions: EvalFixture = {
      ...tiny,
      items: [...tiny.items.slice(1), { key: 's', title: 'source', body: '', vector: [1, 0] }],
    };
    expect(() => evaluateFixture(wrongDimensions, 0.5)).toThrow(/dimensions/);

    const miscounted: EvalFixture = {
      ...tiny,
      expectedAtPin: { truePositives: 9, falsePositives: 0, trueNegatives: 0, falseNegatives: 0 },
    };
    expect(() => evaluateFixture(miscounted, 0.5)).toThrow(/but the fixture has/);
  });

  it('rejects every malformation the validator claims to catch, not just three', () => {
    // `assertFixtureWellFormed` exists for the day a script regenerates this
    // corpus from real embeddings, and its whole value is being fail-closed —
    // a validator with a dead arm lets a shrunken or mis-keyed corpus through,
    // and a shrunken corpus still reports a precision. Only the dangling
    // candidate, wrong dimensionality and miscount arms were covered; deleting
    // any of the six below left the suite green.
    //
    // Duplicate item keys are the nastiest of them: `fixtureVector` resolves
    // keys with `.find()`, so a regenerated corpus carrying one key twice
    // scores every pair against the FIRST vector and reports a confident,
    // entirely wrong matrix.
    const item = (key: string, vector: number[]) => ({ key, title: key, body: '', vector });
    const pair = (source: string, candidate: string) => ({
      source,
      candidate,
      expected: 'related' as const,
      band: 'clear' as const,
      expectedSimilarity: 0,
      note: 'test-local',
    });
    const counts = (total: number) => ({
      truePositives: total,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
    });

    const cases: Array<{ name: string; fixture: EvalFixture; throws: RegExp }> = [
      {
        name: 'duplicate item key',
        fixture: { ...tiny, items: [...tiny.items, item('hit', [1, 1, 0])] },
        throws: /duplicate fixture item key/,
      },
      {
        name: 'zero vector',
        fixture: { ...tiny, items: [...tiny.items, item('zero', [0, 0, 0])] },
        throws: /zero vector/,
      },
      {
        name: 'empty title',
        fixture: {
          ...tiny,
          items: [...tiny.items, { key: 'blank', title: '   ', body: '', vector: [1, 0, 0] }],
        },
        throws: /empty title/,
      },
      {
        name: 'dangling source reference',
        fixture: { ...tiny, pairs: [pair('nope', 'hit')], expectedAtPin: counts(1) },
        throws: /unknown source/,
      },
      {
        name: 'self-pair',
        fixture: { ...tiny, pairs: [pair('hit', 'hit')], expectedAtPin: counts(1) },
        throws: /its own candidate/,
      },
      {
        name: 'duplicate labelled pair',
        fixture: {
          ...tiny,
          pairs: [pair('s', 'hit'), pair('s', 'hit')],
          expectedAtPin: counts(2),
        },
        throws: /duplicate labelled pair/,
      },
      {
        name: 'no labelled pairs',
        fixture: { ...tiny, pairs: [], expectedAtPin: counts(0) },
        throws: /no labelled pairs/,
      },
    ];

    for (const testCase of cases) {
      expect(
        () => assertFixtureWellFormed(testCase.fixture),
        testCase.name,
      ).toThrow(testCase.throws);
    }
  });
});
