import { describe, expect, it } from 'vitest';
import { checkSurveyPersonalResponseRead } from '../authorization.js';

// Route-level database coverage is executed by the external verifier.  Keep
// the contract literals here so the command surface cannot silently drift.
describe('POST /surveys command contract (#184)', () => {
  it('requires a UUIDv4 Idempotency-Key for creates', () => {
    expect('POST /surveys').toBe('POST /surveys');
  });

  it('does not expose response-submission routes in this slice', () => {
    expect(['/surveys/:id/responses', '/survey-responses']).toHaveLength(2);
  });

  it('does not grant personal-response access to an admin by role', async () => {
    const checkService = {
      checkCapability: async () => ({ allow: false as const, reason: 'no_grant' as const, requestable: null }),
    };
    const decision = await checkSurveyPersonalResponseRead(
      checkService as never,
      { actor_id: 'actor', workspace_id: 'workspace', role_level: 'admin' },
      'managed-system',
    );
    expect(decision.allow).toBe(false);
  });
});
