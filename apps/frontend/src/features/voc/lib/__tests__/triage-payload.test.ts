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
