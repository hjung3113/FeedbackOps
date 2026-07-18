import { describe, expect, it } from 'vitest';

import {
  type LinkVisibilityEvaluationInput,
  evaluateLinkVisibility,
} from '../evaluate-visibility.js';

const reporterId = '00000000-0000-4000-8000-000000000001';
const otherReporterId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const developerId = '00000000-0000-4000-8000-000000000004';
const adminId = '00000000-0000-4000-8000-000000000005';

const sectionCMatrix = [
  {
    actor: 'Reporter (own VOC)',
    actorContext: { role_level: 'user' as const, actor_id: reporterId },
    sourceReadable: true,
    targetReadable: true,
    sourceReporterId: reporterId,
    targetReporterId: reporterId,
    expected: {
      internal_only: 'hidden',
      summary_visible: 'hidden',
      visible_to_reporter: 'allowed',
      admin_only: 'hidden',
    },
  },
  {
    actor: 'User',
    actorContext: { role_level: 'user' as const, actor_id: userId },
    sourceReadable: true,
    targetReadable: true,
    sourceReporterId: reporterId,
    targetReporterId: reporterId,
    expected: {
      internal_only: 'hidden',
      summary_visible: 'hidden',
      visible_to_reporter: 'hidden',
      admin_only: 'hidden',
    },
  },
  {
    actor: 'Dev in-scope',
    actorContext: { role_level: 'developer' as const, actor_id: developerId },
    sourceReadable: true,
    targetReadable: true,
    sourceReporterId: reporterId,
    targetReporterId: otherReporterId,
    expected: {
      internal_only: 'allowed',
      summary_visible: 'allowed',
      visible_to_reporter: 'allowed',
      admin_only: 'denied',
    },
  },
  {
    actor: 'Dev out-scope',
    actorContext: { role_level: 'developer' as const, actor_id: developerId },
    sourceReadable: false,
    targetReadable: false,
    sourceReporterId: reporterId,
    targetReporterId: otherReporterId,
    expected: {
      internal_only: 'hidden',
      summary_visible: 'hidden',
      visible_to_reporter: 'hidden',
      admin_only: 'hidden',
    },
  },
  {
    actor: 'Admin',
    actorContext: { role_level: 'admin' as const, actor_id: adminId },
    sourceReadable: true,
    targetReadable: true,
    sourceReporterId: reporterId,
    targetReporterId: otherReporterId,
    expected: {
      internal_only: 'allowed',
      summary_visible: 'allowed',
      visible_to_reporter: 'allowed',
      admin_only: 'allowed',
    },
  },
] as const;

const visibilities = [
  'internal_only',
  'summary_visible',
  'visible_to_reporter',
  'admin_only',
] as const;

const readabilityCases = [
  { label: 'source unreadable', sourceReadable: false, targetReadable: true },
  { label: 'target unreadable', sourceReadable: true, targetReadable: false },
  { label: 'both unreadable', sourceReadable: false, targetReadable: false },
] as const;

describe('evaluateLinkVisibility', () => {
  for (const actor of sectionCMatrix) {
    for (const visibility of visibilities) {
      it(`matches ADR-0023 Section C for ${visibility} / ${actor.actor}`, () => {
        const input: LinkVisibilityEvaluationInput = {
          visibility,
          actorContext: actor.actorContext,
          sourceReadable: actor.sourceReadable,
          targetReadable: actor.targetReadable,
          targetSummaryAvailable: false,
          sourceReporterId: actor.sourceReporterId,
          targetReporterId: actor.targetReporterId,
        };

        expect(evaluateLinkVisibility(input)).toBe(actor.expected[visibility]);
      });
    }
  }

  for (const visibility of visibilities) {
    for (const readability of readabilityCases) {
      it(`hides ${visibility} when ${readability.label}`, () => {
        expect(
          evaluateLinkVisibility({
            visibility,
            actorContext: { role_level: 'developer', actor_id: developerId },
            sourceReadable: readability.sourceReadable,
            targetReadable: readability.targetReadable,
            targetSummaryAvailable: false,
            sourceReporterId: reporterId,
            targetReporterId: reporterId,
          }),
        ).toBe('hidden');
      });
    }
  }

  it('returns summary_visible for non-privileged actors only when a target summary is available', () => {
    expect(
      evaluateLinkVisibility({
        visibility: 'summary_visible',
        actorContext: { role_level: 'user', actor_id: userId },
        sourceReadable: true,
        targetReadable: true,
        targetSummaryAvailable: true,
        sourceReporterId: reporterId,
        targetReporterId: reporterId,
      }),
    ).toBe('summary_visible');
  });

  it('returns a safe summary to a Reporter with a readable source and unreadable target', () => {
    expect(
      evaluateLinkVisibility({
        visibility: 'summary_visible',
        actorContext: { actor_id: 'reporter', role_level: 'user' },
        sourceReadable: true,
        targetReadable: false,
        targetSummaryAvailable: true,
      }),
    ).toBe('summary_visible');
  });

  it.each([
    [
      'User with unreadable source',
      'summary_visible',
      { role_level: 'user' as const, actor_id: userId },
      false,
    ],
    ['Admin', 'summary_visible', { role_level: 'admin' as const, actor_id: adminId }, true],
    [
      'Developer',
      'summary_visible',
      { role_level: 'developer' as const, actor_id: developerId },
      true,
    ],
    [
      'User internal_only',
      'internal_only',
      { role_level: 'user' as const, actor_id: userId },
      true,
    ],
    [
      'User visible_to_reporter',
      'visible_to_reporter',
      { role_level: 'user' as const, actor_id: userId },
      true,
    ],
    ['User admin_only', 'admin_only', { role_level: 'user' as const, actor_id: userId }, true],
  ])(
    'keeps the unchanged unreadable-target cell hidden for %s when a summary is available',
    (_label, visibility, actorContext, sourceReadable) => {
      expect(
        evaluateLinkVisibility({
          visibility: visibility as LinkVisibilityEvaluationInput['visibility'],
          actorContext,
          sourceReadable,
          targetReadable: false,
          targetSummaryAvailable: true,
          sourceReporterId: reporterId,
          targetReporterId: reporterId,
        }),
      ).toBe('hidden');
    },
  );

  it('hides visible_to_reporter when the actor is not the shared reporter', () => {
    expect(
      evaluateLinkVisibility({
        visibility: 'visible_to_reporter',
        actorContext: { role_level: 'user', actor_id: reporterId },
        sourceReadable: true,
        targetReadable: true,
        targetSummaryAvailable: false,
        sourceReporterId: reporterId,
        targetReporterId: otherReporterId,
      }),
    ).toBe('hidden');
  });
});
