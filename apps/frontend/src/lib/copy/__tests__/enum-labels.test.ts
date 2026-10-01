import {
  entityLinkRelationTypeSchema,
  evidenceHighlightImportanceSchema,
  evidenceHighlightSentimentSchema,
  evidenceHighlightSourceTypeSchema,
  findingConfidenceSchema,
  findingDtoSchema,
  findingSeveritySchema,
  findingStatusSchema,
  ratingBandSchema,
  surveyQuestionKindSchema,
  surveyStatusSchema,
  surveyTypeSchema,
  taskPrioritySchema,
  taskRequestStatusSchema,
  taskStatusSchema,
  triageStateEnumSchema,
} from '@fops/shared';
import { describe, expect, it } from 'vitest';
import {
  ENTITY_LINK_RELATION_LABELS,
  EVIDENCE_IMPORTANCE_LABELS,
  EVIDENCE_SENTIMENT_LABELS,
  EVIDENCE_SOURCE_TYPE_LABELS,
  FINDING_CONFIDENCE_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_SOURCE_TYPE_LABELS,
  FINDING_STATUS_LABELS,
  RATING_BAND_LABELS,
  SURVEY_QUESTION_KIND_LABELS,
  SURVEY_RESULT_KIND_LABELS,
  SURVEY_STATUS_LABELS,
  SURVEY_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_REQUEST_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TRIAGE_STATE_LABELS,
} from '../enum-labels';

function expectCompleteLabels<T extends string>(values: readonly T[], labels: Record<T, string>) {
  expect(Object.keys(labels).sort()).toEqual([...values].sort());
  for (const value of values) {
    expect(labels[value]).toBeTruthy();
    expect(labels[value]).not.toBe(value);
  }
}

describe('enum display labels', () => {
  it('covers every triage state', () => {
    expectCompleteLabels(triageStateEnumSchema.options, TRIAGE_STATE_LABELS);
  });

  it('covers every survey type', () => {
    expectCompleteLabels(surveyTypeSchema.options, SURVEY_TYPE_LABELS);
  });

  it('covers every survey question kind', () => {
    expectCompleteLabels(surveyQuestionKindSchema.options, SURVEY_QUESTION_KIND_LABELS);
  });

  it('covers every survey status', () => {
    expectCompleteLabels(surveyStatusSchema.options, SURVEY_STATUS_LABELS);
  });

  it('covers every task priority', () => {
    expectCompleteLabels(taskPrioritySchema.options, TASK_PRIORITY_LABELS);
  });

  it('covers every Finding severity', () => {
    expectCompleteLabels(findingSeveritySchema.options, FINDING_SEVERITY_LABELS);
  });

  it('covers every Finding confidence', () => {
    expectCompleteLabels(findingConfidenceSchema.options, FINDING_CONFIDENCE_LABELS);
  });

  it('covers every Finding source type', () => {
    const sourceTypes = findingDtoSchema.options.map((option) => option.shape.source_type.value);
    expectCompleteLabels(sourceTypes, FINDING_SOURCE_TYPE_LABELS);
  });

  it('covers every Evidence source type', () => {
    expectCompleteLabels(evidenceHighlightSourceTypeSchema.options, EVIDENCE_SOURCE_TYPE_LABELS);
  });

  it('covers every Evidence sentiment', () => {
    expectCompleteLabels(evidenceHighlightSentimentSchema.options, EVIDENCE_SENTIMENT_LABELS);
  });

  it('covers every Evidence importance', () => {
    expectCompleteLabels(evidenceHighlightImportanceSchema.options, EVIDENCE_IMPORTANCE_LABELS);
  });

  it('covers every rating band', () => {
    expectCompleteLabels(ratingBandSchema.options, RATING_BAND_LABELS);
  });

  it('covers every Finding status', () => {
    expectCompleteLabels(findingStatusSchema.options, FINDING_STATUS_LABELS);
  });

  it('covers every Task status', () => {
    expectCompleteLabels(taskStatusSchema.options, TASK_STATUS_LABELS);
  });

  it('covers every Task Request status', () => {
    expectCompleteLabels(taskRequestStatusSchema.options, TASK_REQUEST_STATUS_LABELS);
  });

  it('covers every entity-link relation type', () => {
    expectCompleteLabels(entityLinkRelationTypeSchema.options, ENTITY_LINK_RELATION_LABELS);
  });

  it('covers each visible survey result kind', () => {
    expectCompleteLabels(['choice', 'rating', 'text'] as const, SURVEY_RESULT_KIND_LABELS);
  });
});
