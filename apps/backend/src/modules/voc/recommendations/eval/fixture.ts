// Labelled-pair evaluation fixture for the recommendation cut (#168 step 5,
// ADR-0034 D5).
//
// ─── READ THIS BEFORE TRUSTING A NUMBER OUT OF THIS FILE ────────────────────
//
// The vectors below are HAND-AUTHORED, not embeddings. They were chosen so
// that every pair's cosine similarity is an exact rational this file can state
// and a person can check by hand. That makes this fixture a pin on *arithmetic
// and plumbing*:
//
//   * the harness computes precision/recall/F1 with the right denominators,
//   * the read model converts pgvector's cosine DISTANCE to similarity in the
//     right direction and compares it against the cut in the right direction,
//   * a pair either side of the cut lands on the side the fixture says.
//
// It is NOT a measurement of semantic quality, and 0.75 is NOT validated by
// it. Validating a cut requires vectors produced by the model that actually
// runs in production (voyage-3, ADR-0034 D1) over real VOC text; this
// environment has no API key and no network, so those vectors cannot be
// produced here. The `expected` labels below are the ground truth a human
// would assign to the *texts*; the vectors are a stand-in for a model's
// opinion of them, and they were picked to place pairs where the arithmetic
// needs pairs to be — including two deliberate disagreements with the labels,
// so the false-positive and false-negative arms of the harness are exercised
// rather than left at zero. Reading the resulting precision of 2/3 as "the
// recommender is 67% precise" would be a category error.
//
// ─── DROPPING IN REAL VECTORS ───────────────────────────────────────────────
//
// The durable part of this fixture is `items[].title` / `items[].body` and
// `pairs[].expected`: the labelled corpus. `items[].vector`,
// `pairs[].expectedSimilarity`, `vectorSource` and `expectedAtPin` are all
// derived artifacts of whatever produced the vectors. To re-tune with real
// embeddings, replace exactly those four and leave the harness, the tests and
// the corpus alone. See `../../AGENTS.md` for the full procedure.
//
// The fixture is a TypeScript module rather than JSON on purpose: the backend
// build does not emit non-`.ts` files from `src/`, and a JSON fixture reached
// by `readFileSync` would work under vitest and be absent from `dist/`. The
// cost is that a generated fixture has to be emitted as a module literal.

/** The human's judgement about the *texts*, independent of any model. */
export type PairLabel = 'related' | 'unrelated';

/**
 * `near_boundary` marks pairs deliberately placed within a few points of the
 * pin. They are the only pairs a small change to the cut moves, so they are
 * what makes the coupling in `__tests__/fixture-pins-threshold.test.ts` bite.
 */
export type PairBand = 'clear' | 'near_boundary';

export interface EvalItem {
  key: string;
  /** VOC title, as it would be embedded (ADR-0034 D6 derives title + body). */
  title: string;
  /** Flattened description text, as it would be embedded. */
  body: string;
  vector: number[];
}

export interface EvalPair {
  /** `EvalItem.key` of the VOC the recommendations are being read *for*. */
  source: string;
  /** `EvalItem.key` of the candidate being scored against it. */
  candidate: string;
  expected: PairLabel;
  band: PairBand;
  /**
   * Cosine similarity of the two vectors, hand-computed from the Pythagorean
   * triple the vector was built from — not copied out of a test run. This is
   * the value the harness and the database must both reproduce.
   */
  expectedSimilarity: number;
  note: string;
}

export interface EvalFixture {
  /**
   * A copy of `VOC_RECOMMENDATION_SIMILARITY_THRESHOLD`, asserted equal to it.
   * See the note on the coupling test for what that does and does not catch.
   */
  thresholdPin: number;
  vectorSource: {
    provenance: 'hand-authored-synthetic' | 'voyage-3';
    dimensions: number;
    note: string;
  };
  items: EvalItem[];
  pairs: EvalPair[];
  /** Hand-counted from the table below; the harness must agree. */
  expectedAtPin: {
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
  };
}

// Every vector is `[a, b, 0]` built from a Pythagorean triple (a, b, c), and
// the two sources are the unit axes, so cosine similarity is exactly `a / c`
// against `src-login-loop` and exactly `b / c` against `src-billing-charge`.
// One candidate therefore carries two different, exactly known similarities —
// which is also why the harness must normalize rather than assume unit input.
const SRC_LOGIN = [1, 0, 0];
const SRC_BILLING = [0, 1, 0];

export const THRESHOLD_EVAL_FIXTURE: EvalFixture = {
  thresholdPin: 0.75,
  vectorSource: {
    provenance: 'hand-authored-synthetic',
    dimensions: 3,
    note:
      'Pythagorean-triple vectors with exactly known cosines. Carries no ' +
      'semantic information; see the file header.',
  },
  items: [
    {
      key: 'src-login-loop',
      title: 'Login redirects back to the sign-in page forever',
      body: 'After entering credentials the app bounces straight back to sign-in. Happens on every browser.',
      vector: SRC_LOGIN,
    },
    {
      key: 'src-billing-charge',
      title: 'Charged twice for the same monthly invoice',
      body: 'Two identical charges for invoice 2291 landed on the card on the same day.',
      vector: SRC_BILLING,
    },
    {
      key: 'cand-login-loop-restated',
      title: 'Cannot sign in, page keeps returning to the login form',
      body: 'Submitting the login form just shows the login form again. Nothing in the UI says why.',
      vector: [1, 0, 0], // vs login 1/1 = 1.0 ; vs billing 0
    },
    {
      key: 'cand-login-slow',
      title: 'Sign-in takes almost a minute before it succeeds',
      body: 'Login eventually works but hangs on the spinner for a long time first.',
      vector: [4, 3, 0], // vs login 4/5 = 0.8 ; vs billing 3/5 = 0.6
    },
    {
      key: 'cand-billing-charge-restated',
      title: 'Duplicate payment taken for one invoice',
      body: 'The same invoice was billed to the card twice in one day.',
      vector: [7, 24, 0], // vs login 7/25 = 0.28 ; vs billing 24/25 = 0.96
    },
    {
      key: 'cand-sso-loop',
      title: 'SSO sign-in loops back to the identity provider',
      body: 'Coming from the SSO provider the app sends the browser straight back to the provider.',
      vector: [55, 48, 0], // vs login 55/73 ≈ 0.75342 ; vs billing 48/73 ≈ 0.65753
    },
    {
      key: 'cand-password-reset-loop',
      title: 'Password reset link returns to the sign-in screen',
      body: 'Following the reset mail lands on sign-in again instead of the new-password form.',
      vector: [21, 20, 0], // vs login 21/29 ≈ 0.72414 ; vs billing 20/29 ≈ 0.68966
    },
    {
      key: 'cand-invoice-pdf-broken',
      title: 'Invoice PDF download fails with a blank page',
      body: 'Clicking download on an invoice opens an empty tab and no file arrives.',
      vector: [105, 88, 0], // vs login 105/137 ≈ 0.76642 ; vs billing 88/137 ≈ 0.64234
    },
    {
      key: 'cand-export-csv-slow',
      title: 'CSV export of the VOC list times out',
      body: 'Exporting more than a few thousand rows never finishes downloading.',
      vector: [72, 65, 0], // vs login 72/97 ≈ 0.74227 ; vs billing 65/97 ≈ 0.67010
    },
    {
      key: 'cand-checkout-card-declined',
      title: 'Checkout says the card was declined but the bank approved it',
      body: 'The bank shows an approved authorisation while checkout reports a decline.',
      vector: [48, 55, 0], // vs login 48/73 ≈ 0.65753 ; vs billing 55/73 ≈ 0.75342
    },
    {
      key: 'cand-mobile-dark-mode',
      title: 'Dark mode on mobile has unreadable contrast',
      body: 'Secondary text on the mobile dashboard is grey on grey in dark mode.',
      vector: [0, 0, 1], // orthogonal to both sources: 0.0
    },
  ],
  pairs: [
    // ── source: src-login-loop ───────────────────────────────────────────────
    {
      source: 'src-login-loop',
      candidate: 'cand-login-loop-restated',
      expected: 'related',
      band: 'clear',
      expectedSimilarity: 1,
      note: 'Same complaint restated. True positive, far above the cut.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-login-slow',
      expected: 'related',
      band: 'clear',
      expectedSimilarity: 4 / 5,
      note: 'Same surface, different failure. True positive.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-sso-loop',
      expected: 'related',
      band: 'near_boundary',
      expectedSimilarity: 55 / 73,
      note: 'Just ABOVE the pin. Must appear; the arm that catches an inverted comparison.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-password-reset-loop',
      expected: 'related',
      band: 'near_boundary',
      expectedSimilarity: 21 / 29,
      note: 'A genuine duplicate the vectors score just BELOW the pin: a false negative on purpose, so recall is not trivially 1.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-invoice-pdf-broken',
      expected: 'unrelated',
      band: 'near_boundary',
      expectedSimilarity: 105 / 137,
      note: 'Unrelated but scored just ABOVE the pin: a false positive on purpose, so precision is not trivially 1.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-export-csv-slow',
      expected: 'unrelated',
      band: 'near_boundary',
      expectedSimilarity: 72 / 97,
      note: 'Just BELOW the pin. Must NOT appear; the other half of the comparison-direction check.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-billing-charge-restated',
      expected: 'unrelated',
      band: 'clear',
      expectedSimilarity: 7 / 25,
      note: 'Different domain entirely. True negative.',
    },
    {
      source: 'src-login-loop',
      candidate: 'cand-checkout-card-declined',
      expected: 'unrelated',
      band: 'clear',
      expectedSimilarity: 48 / 73,
      note: 'True negative. Same candidate is a near-boundary false positive for the other source.',
    },
    // ── source: src-billing-charge ───────────────────────────────────────────
    {
      source: 'src-billing-charge',
      candidate: 'cand-billing-charge-restated',
      expected: 'related',
      band: 'clear',
      expectedSimilarity: 24 / 25,
      note: 'Same complaint restated. True positive.',
    },
    {
      source: 'src-billing-charge',
      candidate: 'cand-checkout-card-declined',
      expected: 'unrelated',
      band: 'near_boundary',
      expectedSimilarity: 55 / 73,
      note: 'Second deliberate false positive, and a second source above the cut so the read model is not exercised from one source only.',
    },
    {
      source: 'src-billing-charge',
      candidate: 'cand-login-slow',
      expected: 'unrelated',
      band: 'clear',
      expectedSimilarity: 3 / 5,
      note: 'True negative. Same candidate is a clear true positive for the other source.',
    },
    {
      source: 'src-billing-charge',
      candidate: 'cand-mobile-dark-mode',
      expected: 'unrelated',
      band: 'clear',
      expectedSimilarity: 0,
      note: 'Orthogonal. True negative.',
    },
    {
      source: 'src-billing-charge',
      candidate: 'cand-login-loop-restated',
      expected: 'unrelated',
      band: 'clear',
      expectedSimilarity: 0,
      note: 'Orthogonal. True negative.',
    },
  ],
  // Hand-counted at cut 0.75 from the 13 rows above:
  //   TP: login/restated, login/slow, login/sso, billing/restated        = 4
  //   FN: login/password-reset                                          = 1
  //   FP: login/invoice-pdf, billing/checkout                           = 2
  //   TN: login/export-csv, login/billing-restated, login/checkout,
  //       billing/login-slow, billing/dark-mode, billing/login-restated = 6
  // precision = 4/6 = 2/3, recall = 4/5, F1 = 2*4/(2*4+2+1) = 8/11.
  // The three differ from each other on purpose: a harness that swapped a
  // denominator would still match if they were all equal.
  expectedAtPin: {
    truePositives: 4,
    falsePositives: 2,
    trueNegatives: 6,
    falseNegatives: 1,
  },
};

/**
 * Fail-closed structural check on the fixture.
 *
 * This exists for the day someone drops in real vectors: a corpus regenerated
 * by a script is exactly the kind of input that arrives with a missing item, a
 * duplicated pair, or one vector at the wrong dimensionality. Any of those
 * would otherwise degrade into a quietly smaller evaluation rather than a
 * failure, and a smaller evaluation still reports a precision.
 */
export function assertFixtureWellFormed(fixture: EvalFixture): void {
  const { dimensions } = fixture.vectorSource;
  const keys = new Set<string>();
  for (const item of fixture.items) {
    if (keys.has(item.key)) throw new Error(`duplicate fixture item key: ${item.key}`);
    keys.add(item.key);
    if (item.vector.length !== dimensions) {
      throw new Error(
        `item ${item.key} has ${item.vector.length} dimensions, expected ${dimensions}`,
      );
    }
    if (item.vector.every((value) => value === 0)) {
      throw new Error(`item ${item.key} has a zero vector; cosine is undefined`);
    }
    if (item.title.trim() === '') throw new Error(`item ${item.key} has an empty title`);
  }

  const seenPairs = new Set<string>();
  for (const pair of fixture.pairs) {
    if (!keys.has(pair.source)) throw new Error(`pair references unknown source: ${pair.source}`);
    if (!keys.has(pair.candidate)) {
      throw new Error(`pair references unknown candidate: ${pair.candidate}`);
    }
    if (pair.source === pair.candidate) {
      throw new Error(`pair ${pair.source} is its own candidate`);
    }
    const id = `${pair.source}→${pair.candidate}`;
    if (seenPairs.has(id)) throw new Error(`duplicate labelled pair: ${id}`);
    seenPairs.add(id);
  }

  if (fixture.pairs.length === 0) throw new Error('fixture has no labelled pairs');
  const total =
    fixture.expectedAtPin.truePositives +
    fixture.expectedAtPin.falsePositives +
    fixture.expectedAtPin.trueNegatives +
    fixture.expectedAtPin.falseNegatives;
  if (total !== fixture.pairs.length) {
    throw new Error(
      `expectedAtPin counts ${total} pairs but the fixture has ${fixture.pairs.length}`,
    );
  }
}

/** Vector lookup by item key; throws rather than returning undefined. */
export function fixtureVector(fixture: EvalFixture, key: string): number[] {
  const item = fixture.items.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`unknown fixture item: ${key}`);
  return item.vector;
}
