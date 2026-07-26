// Precision/recall/F1 over labelled VOC pairs (#168 step 5, ADR-0034 D5).
//
// Pure and provider-agnostic: it takes vectors and labels and returns counts.
// It never talks to a database or an embedding provider, so the same harness
// scores hand-authored vectors today and real voyage-3 vectors later without
// changing.
//
// What it deliberately does NOT do is decide whether a number is good. It
// reports; the fixture pins; a human chooses the cut.

import {
  type EvalFixture,
  type PairBand,
  type PairLabel,
  assertFixtureWellFormed,
  fixtureVector,
} from './fixture.js';

/**
 * Cosine similarity, normalizing both operands.
 *
 * The same quantity `selectVocRecommendations` obtains as `1 - (a <=> b)`.
 * Normalization is not an optimization to skip: fixture vectors are built from
 * Pythagorean triples and are not unit vectors, and a harness that assumed
 * unit input would report a similarity of 73 where the database reports 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine similarity needs equal dimensions, got ${a.length} and ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += (a[i] as number) * (b[i] as number);
    normA += (a[i] as number) ** 2;
    normB += (b[i] as number) ** 2;
  }
  if (normA === 0 || normB === 0)
    throw new Error('cosine similarity is undefined for a zero vector');
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type ConfusionCell = 'tp' | 'fp' | 'tn' | 'fn';

export interface PairOutcome {
  source: string;
  candidate: string;
  expected: PairLabel;
  band: PairBand;
  similarity: number;
  predicted: PairLabel;
  cell: ConfusionCell;
}

export interface EvalReport {
  cut: number;
  pairs: PairOutcome[];
  counts: Record<ConfusionCell, number>;
  /**
   * `null`, not 0 and not 1, when the metric is undefined:
   *   * precision when nothing was predicted related (no denominator),
   *   * recall when nothing was labelled related (no denominator),
   *   * F1 when either input is null, or when both are 0.
   * A degenerate run is a fact about the fixture, and reporting it as 0 makes
   * an empty evaluation look like a failing one while reporting it as 1 makes
   * it look like a passing one. Both are lies a caller would act on.
   */
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

/**
 * `>=`, matching the SQL in `selectVocRecommendations` (`score >= threshold`).
 * If that comparison ever changes, this must change with it or the harness
 * stops describing what ships — a pair exactly at the cut is the only input
 * that tells them apart, and the fixture has none by construction, so this is
 * a correspondence to keep by reading, not by testing.
 */
export function predictLabel(similarity: number, cut: number): PairLabel {
  return similarity >= cut ? 'related' : 'unrelated';
}

function classify(expected: PairLabel, predicted: PairLabel): ConfusionCell {
  if (expected === 'related') return predicted === 'related' ? 'tp' : 'fn';
  return predicted === 'related' ? 'fp' : 'tn';
}

/** Counts → metrics. Exported so the degenerate cases are directly testable. */
export function metricsFrom(counts: Record<ConfusionCell, number>): {
  precision: number | null;
  recall: number | null;
  f1: number | null;
} {
  const predictedPositive = counts.tp + counts.fp;
  const actualPositive = counts.tp + counts.fn;
  const precision = predictedPositive === 0 ? null : counts.tp / predictedPositive;
  const recall = actualPositive === 0 ? null : counts.tp / actualPositive;
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/**
 * Scores every labelled pair in the fixture at `cut`.
 *
 * The fixture is validated first: a malformed corpus must fail loudly rather
 * than produce a precision over whatever survived parsing.
 */
export function evaluateFixture(fixture: EvalFixture, cut: number): EvalReport {
  assertFixtureWellFormed(fixture);
  const counts: Record<ConfusionCell, number> = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const pairs = fixture.pairs.map((pair) => {
    const similarity = cosineSimilarity(
      fixtureVector(fixture, pair.source),
      fixtureVector(fixture, pair.candidate),
    );
    const predicted = predictLabel(similarity, cut);
    const cell = classify(pair.expected, predicted);
    counts[cell] += 1;
    return {
      source: pair.source,
      candidate: pair.candidate,
      expected: pair.expected,
      band: pair.band,
      similarity,
      predicted,
      cell,
    };
  });
  return { cut, pairs, counts, ...metricsFrom(counts) };
}
