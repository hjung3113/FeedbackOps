// #168 step 5 — the coupling ADR-0034 D5 asks for: "changing the default
// requires updating that fixture in the same change".
//
// ─── WHAT THIS ENFORCES, EXACTLY ────────────────────────────────────────────
//
// Three assertions, in increasing strength:
//
//   1. `thresholdPin` equals the shipped constant. Editing the constant alone
//      fails here. This catches the careless edit and nothing more — a copy of
//      a number is a copy of a number.
//   2. The harness, run at the *live constant* rather than at the fixture's
//      copy, reproduces `expectedAtPin` cell for cell. So updating both
//      numbers in lockstep still fails: the confusion matrix at the new cut is
//      different, and the editor has to look at which pairs moved and write
//      down the new counts.
//   3. The *nearest* near-boundary pair on each side of the pin sits within
//      0.01 of it, and that is asserted, not hoped for. It is what makes (2)
//      bite: without pairs near the cut, a cut change would leave every cell
//      where it was and (2) would pass while measuring nothing. Note the bound
//      is on the nearest per side, not on every banded pair — one pair drifting
//      away is harmless as long as another still straddles the cut, and
//      `cand-invoice-pdf-broken` (≈0.0164 above) is banded `near_boundary` for
//      its role as the deliberate false positive rather than for its distance.
//
// ─── WHAT IT DOES NOT ENFORCE ───────────────────────────────────────────────
//
// It cannot force anyone to *justify* a new cut. Someone who moves the
// constant, reruns, and pastes the new counts into `expectedAtPin` gets a
// green suite. What the mechanism buys is that they must see the flipped pairs
// while doing it — the diff shows which labelled pairs the change gained and
// lost. That is a review surface, not a proof.
//
// And it says nothing about whether 0.75 is a good cut. See `../fixture.ts`.

import { describe, expect, it } from 'vitest';

import { VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from '../../constants.js';
import { THRESHOLD_EVAL_FIXTURE, assertFixtureWellFormed } from '../fixture.js';
import { cosineSimilarity, evaluateFixture } from '../harness.js';

const fixture = THRESHOLD_EVAL_FIXTURE;

describe('threshold evaluation fixture (#168)', () => {
  it('is structurally well formed', () => {
    expect(() => assertFixtureWellFormed(fixture)).not.toThrow();
  });

  it('pins the shipped threshold constant', () => {
    // ADR-0034 D5. If this fails you changed
    // VOC_RECOMMENDATION_SIMILARITY_THRESHOLD without touching the fixture.
    // Re-derive `expectedAtPin` from the pairs at the new cut in this same
    // change, and record what the new cut is based on.
    expect(VOC_RECOMMENDATION_SIMILARITY_THRESHOLD).toBe(fixture.thresholdPin);
  });

  it('reproduces every pair’s hand-computed similarity', () => {
    // The similarities are stated in the fixture as exact rationals from the
    // Pythagorean triple each vector was built from. Agreement here means the
    // harness's cosine is the same function a person computed on paper.
    for (const pair of fixture.pairs) {
      const similarity = cosineSimilarity(
        fixture.items.find((item) => item.key === pair.source)?.vector ?? [],
        fixture.items.find((item) => item.key === pair.candidate)?.vector ?? [],
      );
      expect(similarity).toBeCloseTo(pair.expectedSimilarity, 12);
    }
  });

  it('produces the hand-counted confusion matrix at the live constant', () => {
    // Deliberately evaluated at the *constant*, not at `fixture.thresholdPin`:
    // that is what makes this assertion move when the constant moves.
    const report = evaluateFixture(fixture, VOC_RECOMMENDATION_SIMILARITY_THRESHOLD);
    expect(report.counts).toEqual({
      tp: fixture.expectedAtPin.truePositives,
      fp: fixture.expectedAtPin.falsePositives,
      tn: fixture.expectedAtPin.trueNegatives,
      fn: fixture.expectedAtPin.falseNegatives,
    });
    // tp=4 fp=2 fn=1 → precision 2/3, recall 4/5, F1 8/11. Restated here as
    // literals so a wrong denominator in `metricsFrom` fails on the shipped
    // fixture too, not only on the synthetic one in harness.test.ts.
    expect(report.precision).toBeCloseTo(2 / 3, 12);
    expect(report.recall).toBeCloseTo(0.8, 12);
    expect(report.f1).toBeCloseTo(8 / 11, 12);
  });

  it('has every cell non-empty, so no arm of the harness is untested', () => {
    // A fixture where the model agrees with every label reports precision and
    // recall of 1 and exercises neither the fp nor the fn branch. The two
    // deliberate disagreements exist to prevent that.
    const report = evaluateFixture(fixture, VOC_RECOMMENDATION_SIMILARITY_THRESHOLD);
    expect(report.counts.tp).toBeGreaterThan(0);
    expect(report.counts.fp).toBeGreaterThan(0);
    expect(report.counts.tn).toBeGreaterThan(0);
    expect(report.counts.fn).toBeGreaterThan(0);
  });

  it('classifies near-boundary pairs on the side the fixture says', () => {
    const report = evaluateFixture(fixture, VOC_RECOMMENDATION_SIMILARITY_THRESHOLD);
    const near = report.pairs.filter((pair) => pair.band === 'near_boundary');
    expect(near.length).toBeGreaterThanOrEqual(4);
    for (const pair of near) {
      const shouldAppear = pair.similarity >= VOC_RECOMMENDATION_SIMILARITY_THRESHOLD;
      expect(pair.predicted).toBe(shouldAppear ? 'related' : 'unrelated');
    }
    // Named, so a silent change to a near-boundary vector is visible here.
    const byPair = new Map(near.map((pair) => [`${pair.source}→${pair.candidate}`, pair]));
    expect(byPair.get('src-login-loop→cand-sso-loop')?.predicted).toBe('related');
    expect(byPair.get('src-login-loop→cand-invoice-pdf-broken')?.predicted).toBe('related');
    expect(byPair.get('src-login-loop→cand-password-reset-loop')?.predicted).toBe('unrelated');
    expect(byPair.get('src-login-loop→cand-export-csv-slow')?.predicted).toBe('unrelated');
    expect(byPair.get('src-billing-charge→cand-checkout-card-declined')?.predicted).toBe('related');
  });

  it('keeps near-boundary pairs tight enough that a cut change flips one', () => {
    const pin = VOC_RECOMMENDATION_SIMILARITY_THRESHOLD;
    const similarities = evaluateFixture(fixture, pin)
      .pairs.filter((pair) => pair.band === 'near_boundary')
      .map((pair) => pair.similarity);
    const above = similarities.filter((value) => value >= pin);
    const below = similarities.filter((value) => value < pin);
    expect(above.length).toBeGreaterThan(0);
    expect(below.length).toBeGreaterThan(0);
    // Nearest on each side: 55/73 ≈ 0.75342 above, 72/97 ≈ 0.74227 below. Any
    // move of the cut larger than ≈0.0035 up or ≈0.0078 down flips a pair and
    // fails the confusion-matrix assertion above.
    expect(Math.min(...above) - pin).toBeLessThan(0.01);
    expect(pin - Math.max(...below)).toBeLessThan(0.01);
  });

  it('reports a different matrix at cuts either side of the pin', () => {
    // The demonstration that the coupling is not vacuous: these are the counts
    // a would-be threshold editor would be confronted with.
    const pinned = evaluateFixture(fixture, VOC_RECOMMENDATION_SIMILARITY_THRESHOLD).counts;
    for (const cut of [0.7, 0.74, 0.76, 0.8]) {
      expect(evaluateFixture(fixture, cut).counts).not.toEqual(pinned);
    }
  });
});
