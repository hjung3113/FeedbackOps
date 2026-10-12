import { describe, expect, it } from 'vitest';
import { buildCompensatePayload, buildTriageSnapshot } from '../triage-payload';

describe('triage compensation payload', () => {
  it.each(['untriaged', 'needs_more_information', 'triaged'] as const)(
    'restores prior triage_state=%s for confirm and finding',
    (triageState) => {
      for (const kind of ['confirm', 'finding'] as const) {
        const snapshot = buildTriageSnapshot(
          {
            kind,
            vocId: 'voc-950',
            ifMatch: '2026-10-10T00:00:00.000Z',
            severity: 'high',
            ownerUserId: null,
            ownerTeamId: null,
            analyticsAreaId: null,
          },
          {
            triageState,
            reviewPostponedAt: null,
            severity: 'low',
            ownerUserId: 'prior-owner',
            ownerTeamId: null,
            analyticsAreaId: 'prior-aa',
          },
        );

        expect(buildCompensatePayload(snapshot)).toEqual({
          triage_state: triageState,
          severity: 'low',
          owner_user_id: 'prior-owner',
          owner_team_id: null,
          analytics_area_id: 'prior-aa',
        });
      }
    },
  );
});

describe('postponed confirm compensation (#955)', () => {
  it.each([
    ['confirm', 'untriaged', '2026-10-10T09:00:00.123+09:00', true],
    ['finding', 'untriaged', '2026-10-10T09:00:00.123+09:00', true],
    ['confirm', 'untriaged', null, false],
    ['confirm', 'triaged', '2026-10-10T09:00:00.123+09:00', false],
    ['skip', 'untriaged', '2026-10-10T09:00:00.123+09:00', false],
  ] as const)('%s from %s with postponed=%s', (kind, triageState, reviewPostponedAt, restores) => {
    const snapshot = buildTriageSnapshot(
      {
        kind,
        vocId: 'voc-955',
        ifMatch: '2026-10-11T00:00:00.000Z',
        severity: 'high',
        ownerUserId: null,
        ownerTeamId: null,
        analyticsAreaId: null,
      },
      {
        triageState,
        reviewPostponedAt,
        severity: 'low',
        ownerUserId: null,
        ownerTeamId: null,
        analyticsAreaId: null,
      },
    );
    expect(buildCompensatePayload(snapshot)).toEqual(
      kind === 'skip'
        ? { postpone_review: false }
        : {
            triage_state: triageState,
            severity: 'low',
            owner_user_id: null,
            owner_team_id: null,
            analytics_area_id: null,
            ...(restores ? { restore_review_postponed_at: reviewPostponedAt } : {}),
          },
    );
  });
});
