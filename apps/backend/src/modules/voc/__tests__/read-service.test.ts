// Unit tests for read-service.ts — no DB, mocked repoRead + checkService.
//
// Coverage:
// - Each access-matrix branch in getVocDetail (5 branches incl. 404).
// - view=my managed_system_id='all' → 422.
// - view=triage sort param → 422.
// - view=inbox developer with empty scope → 403 permission.scope_required.
// - view=triage empty intersected scope → 403.
// - tab=waiting on view=inbox → 422.
// - listVocs out_of_scope_summary only on inbox.
// - Cursor encode/decode round-trip via the service path.
// - getConversation 403 when actor in summary-only state.

import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../../../lib/errors.js';
import type { Decision } from '../../permissions/check-service.js';
import type { VocReadServiceDeps } from '../read-service.js';
import { createVocReadService } from '../read-service.js';
import type { VocReadRow, ConversationRow, Scope } from '../repo-read.js';
import * as repoRead from '../repo-read.js';
import * as transitions from '../transitions.js';
import { encodeCursor } from '../cursor.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeVocRow(overrides: Partial<VocReadRow> = {}): VocReadRow {
  return {
    id: randomUUID(),
    displayId: 'VOC-0001',
    title: 'Test VOC',
    workspaceId: randomUUID(),
    primaryManagedSystemId: randomUUID(),
    analyticsAreaId: null,
    reporterId: randomUUID(),
    ownerUserId: null,
    ownerTeamId: null,
    severity: null,
    reporterFacingStatus: 'received',
    triageState: 'untriaged',
    triageStateReviewPostponedAt: null,
    sourceContext: 'direct_use',
    descriptionRichContent: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeConversationRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: randomUUID(),
    kind: 'public_update',
    actorId: randomUUID(),
    bodyRichContent: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    visibility: 'public',
    ...overrides,
  };
}

const scopeAll: Scope = { kind: 'all' };
const scopeEmpty: Scope = { kind: 'scoped', managedSystemIds: [] };

function scopeFor(ids: string[]): Scope {
  return { kind: 'scoped', managedSystemIds: ids };
}

const allowDecision: Decision = { allow: true, via: 'role' };
const noGrantDecision: Decision = { allow: false, reason: 'no_grant', requestable: null };
const denyDecision: Decision = { allow: false, reason: 'explicit_deny', requestable: null };

// ── Mock setup ────────────────────────────────────────────────────────────────

vi.mock('../repo-read.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../repo-read.js')>();
  return {
    ...original,
    actorReadScope: vi.fn(),
    actorEffectiveScope: vi.fn(),
    actorTriageScope: vi.fn(),
    listVocsForRead: vi.fn(),
    selectVocByIdForRead: vi.fn(),
    selectConversationPage: vi.fn(),
    outOfScopeSummary: vi.fn(),
    selectPermissionDecisionsSeed: vi.fn(),
    // PLAN-22 §Bug-1 (2026-05-22): new attachment read projections.
    selectVocAttachments: vi.fn(),
    selectAttachmentsForComments: vi.fn(),
    selectVocAttachmentCounts: vi.fn(),
  };
});

vi.mock('../transitions.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../transitions.js')>();
  return {
    ...original,
    nextReporterStates: vi.fn(),
  };
});

// ── Service factory ───────────────────────────────────────────────────────────

function makeService(checkDecision: Decision = allowDecision) {
  const db = {} as VocReadServiceDeps['db'];
  const checkService = {
    checkCapability: vi.fn().mockResolvedValue(checkDecision),
  } as unknown as VocReadServiceDeps['checkService'];
  const entityLinksService = {
    createLink: vi.fn(),
    listLinks: vi.fn().mockResolvedValue([]),
  } as unknown as NonNullable<VocReadServiceDeps['entityLinksService']>;
  return { svc: createVocReadService({ db, checkService, entityLinksService }), checkService };
}

// ── listVocs tests ────────────────────────────────────────────────────────────

describe('listVocs', () => {
  const workspaceId = randomUUID();
  const actor = {
    actor_id: randomUUID(),
    workspace_id: workspaceId,
    role_level: 'user' as const,
  };

  beforeEach(() => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.actorTriageScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.listVocsForRead).mockResolvedValue({
      rows: [],
      hasMore: false,
      nextCursor: null,
    });
    vi.mocked(repoRead.outOfScopeSummary).mockResolvedValue(null);
    // PLAN-22 §Bug-1: default empty maps so tests not explicitly testing
    // attachments don't blow up on undefined.
    vi.mocked(repoRead.selectVocAttachmentCounts).mockResolvedValue(new Map());
  });

  it('view=my with managed_system_id=all → 422', async () => {
    const { svc } = makeService();
    await expect(
      svc.listVocs({
        actor,
        query: {
          view: 'my',
          managed_system_id: 'all',
          limit: 50,
        },
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('view=triage with sort param → 422', async () => {
    const { svc } = makeService();
    await expect(
      svc.listVocs({
        actor,
        query: {
          view: 'triage',
          sort: 'created_at:desc',
          limit: 50,
        },
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('view=inbox developer with empty scope → 403 permission.scope_required', async () => {
    const devActor = { ...actor, role_level: 'developer' as const };
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);

    const { svc } = makeService();
    await expect(
      svc.listVocs({
        actor: devActor,
        query: { view: 'inbox', limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'permission.scope_required' });
  });

  it('view=inbox non-developer with empty scope → 403 permission.denied', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);

    const { svc } = makeService();
    await expect(
      svc.listVocs({
        actor,
        query: { view: 'inbox', limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });
  });

  it('view=triage empty intersected scope → 403 permission.denied', async () => {
    const msA = randomUUID();
    const msB = randomUUID();
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeFor([msA]));
    vi.mocked(repoRead.actorTriageScope).mockResolvedValue(scopeFor([msB]));

    const { svc } = makeService();
    await expect(
      svc.listVocs({
        actor,
        query: { view: 'triage', limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });
  });

  it('tab=waiting on view=inbox → 422', async () => {
    const { svc } = makeService();
    await expect(
      svc.listVocs({
        actor,
        query: { view: 'inbox', tab: 'waiting', limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('out_of_scope_summary only emitted for inbox view', async () => {
    const msId = randomUUID();
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeFor([msId]));
    vi.mocked(repoRead.outOfScopeSummary).mockResolvedValue({
      count: 5,
      severity_distribution: { low: 3, medium: 1, high: 1, critical: 0 },
    });

    const { svc } = makeService();

    // inbox → should include out_of_scope_summary
    const inboxResult = await svc.listVocs({
      actor,
      query: { view: 'inbox', limit: 50 },
    });
    expect(inboxResult.out_of_scope_summary).toBeDefined();
    expect(inboxResult.out_of_scope_summary?.count).toBe(5);

    // my → should NOT include out_of_scope_summary
    vi.mocked(repoRead.listVocsForRead).mockResolvedValue({
      rows: [],
      hasMore: false,
      nextCursor: null,
    });
    const myResult = await svc.listVocs({
      actor,
      query: { view: 'my', limit: 50 },
    });
    expect(myResult.out_of_scope_summary).toBeUndefined();
  });

  it('cursor encode/decode round-trip via service path', async () => {
    const id = randomUUID();
    const sv = '2024-06-01T12:00:00.000Z';
    const repoCursor = { sv, id };

    const listMock = vi.mocked(repoRead.listVocsForRead);
    listMock.mockClear();
    listMock.mockResolvedValue({
      rows: [],
      hasMore: true,
      nextCursor: repoCursor,
    });

    const { svc } = makeService();
    const result = await svc.listVocs({
      actor,
      query: { view: 'inbox', limit: 50 },
    });

    expect(result.page.has_more).toBe(true);
    expect(result.page.cursor).toBeDefined();

    // Reset mock for second call to return no-more-results.
    listMock.mockResolvedValue({
      rows: [],
      hasMore: false,
      nextCursor: null,
    });

    // The cursor should be decodable on the next request.
    const nextResult = await svc.listVocs({
      actor,
      query: { view: 'inbox', cursor: result.page.cursor!, limit: 50 },
    });

    // The decoded cursor must be passed to the repo (sv may be string/number, id is UUID).
    expect(listMock.mock.calls).toHaveLength(2);
    const secondCall = listMock.mock.calls[1]!;
    expect(secondCall[1].cursor).toBeDefined();
    expect(secondCall[1].cursor!.id).toBe(id);
    expect(nextResult.page.has_more).toBe(false);
  });
});

// ── getVocDetail tests ────────────────────────────────────────────────────────

describe('getVocDetail', () => {
  const workspaceId = randomUUID();
  const actorId = randomUUID();
  const msId = randomUUID();
  const actor = {
    actor_id: actorId,
    workspace_id: workspaceId,
    role_level: 'user' as const,
  };

  const baseRow = makeVocRow({
    workspaceId,
    primaryManagedSystemId: msId,
  });

  beforeEach(() => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.actorTriageScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.selectVocByIdForRead).mockResolvedValue(baseRow);
    vi.mocked(repoRead.selectConversationPage).mockResolvedValue({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });
    vi.mocked(repoRead.selectPermissionDecisionsSeed).mockResolvedValue(null);
    // PLAN-22 §Bug-1: default to empty so unrelated tests don't crash.
    vi.mocked(repoRead.selectVocAttachments).mockResolvedValue([]);
    vi.mocked(repoRead.selectAttachmentsForComments).mockResolvedValue(new Map());
    vi.mocked(transitions.nextReporterStates).mockResolvedValue({
      allowed: ['reviewing'],
      forbidden: {},
    });
  });

  it('404 when VOC not found', async () => {
    vi.mocked(repoRead.selectVocByIdForRead).mockResolvedValue(null);

    const { svc } = makeService();
    await expect(
      svc.getVocDetail({ actor, vocId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'not_found.record' });
  });

  it('full envelope when msInReadScope', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeFor([msId]));

    const { svc } = makeService();
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });

    expect(result.kind).toBe('full');
    if (result.kind === 'full') {
      expect(result.envelope.id).toBe(baseRow.id);
      expect(result.etag).toBe(`W/"${baseRow.updatedAt.toISOString()}"`);
    }
  });

  it('full envelope when isReporter (even without readScope)', async () => {
    const reporterActor = { ...actor, actor_id: baseRow.reporterId };
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeEmpty);

    const { svc } = makeService();
    const result = await svc.getVocDetail({ actor: reporterActor, vocId: baseRow.id });

    expect(result.kind).toBe('full');
  });

  it('summary envelope when in effectiveScope but not readScope', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeFor([msId]));

    const { svc } = makeService(noGrantDecision);
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });

    expect(result.kind).toBe('summary');
    if (result.kind === 'summary') {
      expect(result.envelope.id).toBe(baseRow.id);
      const selfDecision = result.envelope.permission_decisions['_self'] as Record<string, unknown>;
      expect(selfDecision.state).toBe('request_access');
    }
  });

  it('summary envelope has blocked_not_requestable when explicit_deny', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeFor([msId]));

    const { svc } = makeService(denyDecision);
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });

    expect(result.kind).toBe('summary');
    if (result.kind === 'summary') {
      const selfDecision = result.envelope.permission_decisions['_self'] as Record<string, unknown>;
      expect(selfDecision.state).toBe('blocked_not_requestable');
    }
  });

  it('404 when not in effectiveScope and not reporter', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeEmpty);

    const { svc } = makeService();
    await expect(
      svc.getVocDetail({ actor, vocId: baseRow.id }),
    ).rejects.toMatchObject({ code: 'not_found.record' });
  });

  it('full envelope includes conversation_timeline', async () => {
    const convRow = makeConversationRow({ kind: 'public_update', visibility: 'public' });
    vi.mocked(repoRead.selectConversationPage).mockResolvedValue({
      entries: [convRow],
      hasMore: false,
      nextCursor: null,
    });

    const { svc } = makeService();
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });

    expect(result.kind).toBe('full');
    if (result.kind === 'full') {
      expect(result.envelope.conversation_timeline).toHaveLength(1);
      expect(result.envelope.conversation_timeline[0]!.id).toBe(convRow.id);
      expect(result.envelope.conversation_page.has_more).toBe(false);
    }
  });

  it('full envelope has_more=true when conversation overflow', async () => {
    vi.mocked(repoRead.selectConversationPage).mockResolvedValue({
      entries: [],
      hasMore: true,
      nextCursor: { createdAt: '2024-01-01T00:00:00Z', id: randomUUID() },
    });

    const { svc } = makeService();
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });

    expect(result.kind).toBe('full');
    if (result.kind === 'full') {
      expect(result.envelope.conversation_page.has_more).toBe(true);
      expect(result.envelope.conversation_page.cursor).toBeDefined();
    }
  });

  it('permission_decisions from seed included verbatim', async () => {
    const seed = { linkedFinding: { ref: 'FINDING-1' } };
    vi.mocked(repoRead.selectPermissionDecisionsSeed).mockResolvedValue(seed);

    const { svc } = makeService();
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });

    expect(result.kind).toBe('full');
    if (result.kind === 'full') {
      expect(result.envelope.permission_decisions).toEqual(seed);
    }
  });
});

// ── getConversation tests ─────────────────────────────────────────────────────

describe('getConversation', () => {
  const workspaceId = randomUUID();
  const actorId = randomUUID();
  const msId = randomUUID();
  const actor = {
    actor_id: actorId,
    workspace_id: workspaceId,
    role_level: 'user' as const,
  };

  const baseRow = makeVocRow({
    workspaceId,
    primaryManagedSystemId: msId,
  });

  // Build a valid cursor for getConversation (encodes ConversationCursor).
  const validConvCursor = Buffer.from(
    JSON.stringify({ createdAt: '2024-01-01T00:00:00.000Z', id: randomUUID() }),
    'utf8',
  ).toString('base64');

  beforeEach(() => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeAll);
    vi.mocked(repoRead.actorTriageScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.selectVocByIdForRead).mockResolvedValue(baseRow);
    vi.mocked(repoRead.selectConversationPage).mockResolvedValue({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });
    // PLAN-22 §Bug-1: default empty.
    vi.mocked(repoRead.selectAttachmentsForComments).mockResolvedValue(new Map());
  });

  it('403 when actor in summary-only state (effectiveScope only)', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeFor([msId]));

    const { svc } = makeService();
    await expect(
      svc.getConversation({
        actor,
        vocId: baseRow.id,
        query: { cursor: validConvCursor, limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });
  });

  it('404 when actor not in effectiveScope and not reporter', async () => {
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeEmpty);

    const { svc } = makeService();
    await expect(
      svc.getConversation({
        actor,
        vocId: baseRow.id,
        query: { cursor: validConvCursor, limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'not_found.record' });
  });

  it('returns items when actor has read scope', async () => {
    const convRow = makeConversationRow();
    vi.mocked(repoRead.selectConversationPage).mockResolvedValue({
      entries: [convRow],
      hasMore: false,
      nextCursor: null,
    });

    const { svc } = makeService();
    const result = await svc.getConversation({
      actor,
      vocId: baseRow.id,
      query: { cursor: validConvCursor, limit: 50 },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe(convRow.id);
    expect(result.page.has_more).toBe(false);
  });

  it('reporter can access conversation without readScope', async () => {
    const reporterActor = { ...actor, actor_id: baseRow.reporterId };
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeEmpty);

    const { svc } = makeService();
    const result = await svc.getConversation({
      actor: reporterActor,
      vocId: baseRow.id,
      query: { cursor: validConvCursor, limit: 50 },
    });

    expect(result.items).toHaveLength(0);
    expect(result.page.has_more).toBe(false);
  });

  it('invalid base64 cursor → 422', async () => {
    const { svc } = makeService();
    await expect(
      svc.getConversation({
        actor,
        vocId: baseRow.id,
        query: { cursor: 'not-valid-json!!!', limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('PLAN-22 Bug-2: first-page (no cursor) does not throw and forwards undefined to repo', async () => {
    const convMock = vi.mocked(repoRead.selectConversationPage);
    convMock.mockClear();
    convMock.mockResolvedValue({ entries: [], hasMore: false, nextCursor: null });

    const { svc } = makeService();
    const result = await svc.getConversation({
      actor,
      vocId: baseRow.id,
      query: { limit: 50 },
    });
    expect(result.items).toEqual([]);
    expect(convMock).toHaveBeenCalledTimes(1);
    // cursor must NOT be present on the repo args when undefined at the wire.
    expect(convMock.mock.calls[0]![1].cursor).toBeUndefined();
  });

  it('M5: cursor with valid base64+JSON but wrong field types → 422 invalid_cursor', async () => {
    const badCursor = Buffer.from(
      JSON.stringify({ createdAt: 'not-an-iso-date', id: 'not-a-uuid' }),
      'utf8',
    ).toString('base64');

    const { svc } = makeService();
    await expect(
      svc.getConversation({
        actor,
        vocId: baseRow.id,
        query: { cursor: badCursor, limit: 50 },
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('M1: effective_scope is union of voc.read and voc.triage — actor with only triage grant sees summary territory', async () => {
    // When actor has voc.triage but no voc.read, effectiveScope includes the MS
    // (via triage grant) but readScope does not → summary path.
    // The service calls actorEffectiveScope which returns union; mocks simulate this.
    vi.mocked(repoRead.actorReadScope).mockResolvedValue(scopeEmpty);
    vi.mocked(repoRead.actorEffectiveScope).mockResolvedValue(scopeFor([msId])); // triage grant union
    vi.mocked(repoRead.actorTriageScope).mockResolvedValue(scopeFor([msId]));

    const { svc } = makeService(noGrantDecision);
    const result = await svc.getVocDetail({ actor, vocId: baseRow.id });
    // In effective scope but not read scope → summary envelope.
    expect(result.kind).toBe('summary');
  });

  it('next page cursor round-trip', async () => {
    const nextId = randomUUID();
    const convMock = vi.mocked(repoRead.selectConversationPage);
    convMock.mockClear();
    convMock.mockResolvedValue({
      entries: [],
      hasMore: true,
      nextCursor: { createdAt: '2024-02-01T00:00:00.000Z', id: nextId },
    });

    const { svc } = makeService();
    const result = await svc.getConversation({
      actor,
      vocId: baseRow.id,
      query: { cursor: validConvCursor, limit: 50 },
    });

    expect(result.page.has_more).toBe(true);
    expect(result.page.cursor).toBeDefined();

    // Use the returned cursor in the next request.
    convMock.mockResolvedValue({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });

    const result2 = await svc.getConversation({
      actor,
      vocId: baseRow.id,
      query: { cursor: result.page.cursor!, limit: 50 },
    });
    expect(result2.page.has_more).toBe(false);
    // Verify the decoded cursor was passed correctly.
    expect(convMock.mock.calls).toHaveLength(2);
    const call2 = convMock.mock.calls[1]!;
    expect(call2[1].cursor).toBeDefined();
    expect(call2[1].cursor!.id).toBe(nextId);
    expect(call2[1].cursor!.createdAt).toBe('2024-02-01T00:00:00.000Z');
  });
});
