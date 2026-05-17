import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  vocCreatedDetailSchema,
  vocTriageCommittedDetailSchema,
  vocSeveritySetDetailSchema,
  vocOwnerAssignedDetailSchema,
  vocAnalyticsAreaLinkedDetailSchema,
  vocClusterDecisionRecordedDetailSchema,
  publicUpdateCreatedDetailSchema,
  reporterFacingStatusChangedDetailSchema,
  reporterReplyCreatedDetailSchema,
  internalCommentCreatedDetailSchema,
} from '../voc.js';
import { AUDIT_EVENT_TYPES, AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const U = '01919b8c-0000-7000-8000-000000000001';

describe('vocCreatedDetailSchema', () => {
  it('accepts required shape', () => {
    const parsed = vocCreatedDetailSchema.parse({
      voc_id: U,
      workspace_id: U,
      primary_managed_system_id: U,
      analytics_area_id: null,
      reporter_id: U,
      source_context: 'direct_use',
    });
    expect(parsed.source_context).toBe('direct_use');
  });

  it('rejects bad source_context', () => {
    expect(() =>
      vocCreatedDetailSchema.parse({
        voc_id: U,
        workspace_id: U,
        primary_managed_system_id: U,
        analytics_area_id: null,
        reporter_id: U,
        source_context: 'phone_call',
      }),
    ).toThrow(z.ZodError);
  });
});

describe('vocTriageCommittedDetailSchema', () => {
  it('accepts atomic shape with severity high, owner set, cluster_decision confirm', () => {
    const parsed = vocTriageCommittedDetailSchema.parse({
      voc_id: U,
      severity: 'high',
      owner_user_id: U,
      owner_team_id: null,
      analytics_area_id: null,
      cluster_decision: 'confirm',
    });
    expect(parsed.severity).toBe('high');
    expect(parsed.cluster_decision).toBe('confirm');
  });

  it('accepts null severity (dismissal path)', () => {
    const parsed = vocTriageCommittedDetailSchema.parse({
      voc_id: U,
      severity: null,
      owner_user_id: null,
      owner_team_id: null,
      analytics_area_id: null,
      cluster_decision: 'dismiss',
    });
    expect(parsed.severity).toBeNull();
    expect(parsed.cluster_decision).toBe('dismiss');
  });

  it('triaged with non-null severity', () => {
    const parsed = vocTriageCommittedDetailSchema.parse({
      voc_id: U,
      severity: 'critical',
      owner_user_id: U,
      owner_team_id: null,
      analytics_area_id: U,
      cluster_decision: null,
    });
    expect(parsed.severity).toBe('critical');
  });
});

describe('vocSeveritySetDetailSchema', () => {
  it('accepts from=null to=critical', () => {
    const parsed = vocSeveritySetDetailSchema.parse({
      voc_id: U,
      from: null,
      to: 'critical',
    });
    expect(parsed.to).toBe('critical');
  });

  it('rejects no-op severity_set (from === to)', () => {
    expect(() =>
      vocSeveritySetDetailSchema.parse({
        voc_id: U,
        from: 'high',
        to: 'high',
      }),
    ).toThrow();
  });
});

describe('vocOwnerAssignedDetailSchema', () => {
  it('accepts user to team reassignment', () => {
    const parsed = vocOwnerAssignedDetailSchema.parse({
      voc_id: U,
      from: { user_id: U, team_id: null },
      to: { user_id: null, team_id: U },
    });
    expect(parsed.from.user_id).toBe(U);
    expect(parsed.to.team_id).toBe(U);
  });

  it('rejects no-op owner assignment (from === to)', () => {
    expect(() =>
      vocOwnerAssignedDetailSchema.parse({
        voc_id: U,
        from: { user_id: U, team_id: null },
        to: { user_id: U, team_id: null },
      }),
    ).toThrow();
  });

  it('rejects both-populated from (XOR violation)', () => {
    expect(() =>
      vocOwnerAssignedDetailSchema.parse({
        voc_id: U,
        from: { user_id: U, team_id: U },
        to: { user_id: null, team_id: U },
      }),
    ).toThrow();
  });

  it('rejects both-populated to (XOR violation)', () => {
    expect(() =>
      vocOwnerAssignedDetailSchema.parse({
        voc_id: U,
        from: { user_id: U, team_id: null },
        to: { user_id: U, team_id: U },
      }),
    ).toThrow();
  });
});

describe('vocAnalyticsAreaLinkedDetailSchema', () => {
  it('accepts null to uuid', () => {
    const parsed = vocAnalyticsAreaLinkedDetailSchema.parse({
      voc_id: U,
      from: null,
      to: U,
    });
    expect(parsed.to).toBe(U);
  });

  it('rejects no-op analytics_area_linked (from === to)', () => {
    expect(() =>
      vocAnalyticsAreaLinkedDetailSchema.parse({
        voc_id: U,
        from: U,
        to: U,
      }),
    ).toThrow();
  });
});

describe('vocClusterDecisionRecordedDetailSchema', () => {
  it('accepts confirm', () => {
    const parsed = vocClusterDecisionRecordedDetailSchema.parse({
      voc_id: U,
      decision: 'confirm',
    });
    expect(parsed.decision).toBe('confirm');
  });

  it('rejects maybe', () => {
    expect(() =>
      vocClusterDecisionRecordedDetailSchema.parse({
        voc_id: U,
        decision: 'maybe',
      }),
    ).toThrow(z.ZodError);
  });
});

describe('publicUpdateCreatedDetailSchema', () => {
  it('accepts skip=true with skip_reason >= 8 chars', () => {
    const parsed = publicUpdateCreatedDetailSchema.parse({
      voc_id: U,
      public_update_id: U,
      actor_id: U,
      skip_public_update: true,
      skip_reason: 'too long to explain briefly',
    });
    expect(parsed.skip_public_update).toBe(true);
  });

  it('accepts skip=false with null skip_reason', () => {
    const parsed = publicUpdateCreatedDetailSchema.parse({
      voc_id: U,
      public_update_id: U,
      actor_id: U,
      skip_public_update: false,
      skip_reason: null,
    });
    expect(parsed.skip_public_update).toBe(false);
    expect(parsed.skip_reason).toBeNull();
  });

  it('rejects null public_update_id', () => {
    expect(() =>
      publicUpdateCreatedDetailSchema.parse({
        voc_id: U,
        public_update_id: null,
        actor_id: U,
        skip_public_update: false,
        skip_reason: null,
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects skip=false with non-null skip_reason', () => {
    expect(() =>
      publicUpdateCreatedDetailSchema.parse({
        voc_id: U,
        public_update_id: U,
        actor_id: U,
        skip_public_update: false,
        skip_reason: 'some reason here',
      }),
    ).toThrow();
  });

  it('rejects skip=true with skip_reason too short', () => {
    expect(() =>
      publicUpdateCreatedDetailSchema.parse({
        voc_id: U,
        public_update_id: U,
        actor_id: U,
        skip_public_update: true,
        skip_reason: 'short',
      }),
    ).toThrow();
  });

  it('rejects skip=true with null skip_reason', () => {
    expect(() =>
      publicUpdateCreatedDetailSchema.parse({
        voc_id: U,
        public_update_id: U,
        actor_id: U,
        skip_public_update: true,
        skip_reason: null,
      }),
    ).toThrow();
  });
});

describe('reporterFacingStatusChangedDetailSchema', () => {
  it('accepts paired_with public_update', () => {
    const parsed = reporterFacingStatusChangedDetailSchema.parse({
      voc_id: U,
      from: 'received',
      to: 'reviewing',
      paired_with: 'public_update',
    });
    expect(parsed.paired_with).toBe('public_update');
  });

  it('accepts paired_with skip', () => {
    const parsed = reporterFacingStatusChangedDetailSchema.parse({
      voc_id: U,
      from: 'reviewing',
      to: 'resolved',
      paired_with: 'skip',
    });
    expect(parsed.paired_with).toBe('skip');
  });
});

describe('reporterReplyCreatedDetailSchema', () => {
  it('accepts required shape', () => {
    const parsed = reporterReplyCreatedDetailSchema.parse({
      voc_id: U,
      reporter_reply_id: U,
      actor_id: U,
    });
    expect(parsed.reporter_reply_id).toBe(U);
  });
});

describe('internalCommentCreatedDetailSchema', () => {
  it('accepts mentions array of UUIDs', () => {
    const parsed = internalCommentCreatedDetailSchema.parse({
      voc_id: U,
      internal_comment_id: U,
      actor_id: U,
      mentions: [U],
    });
    expect(parsed.mentions).toHaveLength(1);
  });

  it('rejects non-uuid in mentions', () => {
    expect(() =>
      internalCommentCreatedDetailSchema.parse({
        voc_id: U,
        internal_comment_id: U,
        actor_id: U,
        mentions: ['not-a-uuid'],
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects empty mentions array (min(1) required)', () => {
    expect(() =>
      internalCommentCreatedDetailSchema.parse({
        voc_id: U,
        internal_comment_id: U,
        actor_id: U,
        mentions: [],
      }),
    ).toThrow();
  });
});

describe('AUDIT_EVENT_TYPES registry', () => {
  const VOC_EVENTS = [
    'voc_created',
    'voc_triage_committed',
    'voc_severity_set',
    'voc_owner_assigned',
    'voc_analytics_area_linked',
    'voc_cluster_decision_recorded',
    'public_update_created',
    'reporter_facing_status_changed',
    'reporter_reply_created',
    'internal_comment_created',
  ] as const;

  it.each(VOC_EVENTS)('%s is in AUDIT_EVENT_TYPES and has a detail schema', (event) => {
    expect(AUDIT_EVENT_TYPES).toContain(event);
    expect(AUDIT_EVENT_DETAIL_SCHEMAS).toHaveProperty(event);
  });
});
