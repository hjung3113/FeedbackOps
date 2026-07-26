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
 * Pinned at 0.75 as the initial value. Justification for *this* number is
 * explicitly deferred to step 5, which adds the labelled-pair evaluation
 * fixture and asserts precision/recall at the chosen cut; until that fixture
 * exists, any figure quoted here would be a guess dressed as a measurement.
 * What is decided now is the *shape*: one constant, one cut, applied in SQL
 * before anything is counted.
 *
 * Per ADR-0034 D5, changing this constant requires updating that fixture in
 * the same change.
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
