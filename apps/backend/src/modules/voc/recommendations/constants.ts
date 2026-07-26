// Pinned recommendation tuning (#168 step 4, ADR-0034 D5).
//
// These live in code, not in the database, so a freshly provisioned workspace
// behaves identically in every environment. There is deliberately no
// workspace-settings column and no environment variable: an operator who can
// move the cut per-environment can make a demo look better than production,
// and the evaluation fixture (step 5) would then be measuring a value nothing
// actually runs at.

/**
 * Minimum cosine similarity for a candidate to be recommended.
 *
 * Pinned at 0.75 as the initial value. **This number is still unvalidated.**
 * Step 5 added the ADR-0034 D5 evaluation fixture
 * (`eval/fixture.ts`, `eval/harness.ts`) and it does pin real behaviour — the
 * distance-to-similarity conversion, the comparison direction, the metric
 * arithmetic — but its vectors are hand-authored, not embeddings. Validating a
 * cut needs vectors from the provider that actually ships (ADR-0034 D1), which
 * needs an API key and network the development environment does not have. Read
 * `../AGENTS.md` § Recommendation Threshold Evaluation before quoting any
 * precision or recall figure out of that fixture: they are properties of the
 * chosen vectors, not of the recommender.
 *
 * What *is* decided is the shape: one constant, one cut, applied in SQL before
 * anything is counted.
 *
 * Per ADR-0034 D5, changing this constant requires updating that fixture in
 * the same change — enforced by
 * `eval/__tests__/fixture-pins-threshold.test.ts`, which fails if this value
 * moves and the fixture does not.
 */
export const VOC_RECOMMENDATION_SIMILARITY_THRESHOLD = 0.75;

/**
 * Maximum recommendations returned in one read.
 *
 * The cap bounds the payload; it does not bound the `total` reported alongside
 * it. Both are derived from the same authorization-filtered set, so "N more"
 * can only ever count candidates the actor is allowed to know exist.
 */
export const VOC_RECOMMENDATION_LIMIT = 10;
