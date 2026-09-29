// apps/backend/src/modules/voc/read-service.ts
//
// Read application service for the VOC module.
// Owns view semantics, scope resolution orchestration, access-matrix decisions,
// and envelope assembly. No route handlers. No DB queries — everything goes
// through repo-read.ts (C1) + cursor.ts.
//
// Access matrix (codex BLOCKER fix):
//   msInReadScope || isReporter          → FULL envelope
//   !msInReadScope && !isReporter && msInEffectiveScope → SUMMARY envelope
//   !msInReadScope && !isReporter && !msInEffectiveScope → 404 not_found.record
//
// ETag header: weak W/"<voc.updated_at-ISO>". ADR-0031 disables conditional
// detail 304 responses because similarity is peer-derived.

import type { Db } from '../../db/client.js';
import type { EntityLinksService } from '../entity-links/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { createVocConversationReader } from './read/conversation.js';
import { createVocDetailReaders } from './read/detail.js';
import { createVocListReaders } from './read/list.js';
import { createVocReferenceReader } from './read/reference.js';

// ── Public interface ─────────────────────────────────────────────────────────

export interface VocReadServiceDeps {
  db: Db;
  checkService: CheckService;
  entityLinksService: EntityLinksService;
}

export interface ReadActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

/**
 * Visibility verdict for a single VOC reference, in the entity-link vocabulary
 * (#378). Computed ONLY by mapping the canonical getVocDetail outcome — no
 * duplicated permission predicates (see #423 regression).
 */
export type VocReferenceResolution =
  | { visibility_state: 'allowed'; id: string; display_id: string; title: string }
  | { visibility_state: 'summary_visible' }
  | { visibility_state: 'denied' }
  | { visibility_state: 'hidden' };

export function createVocReadService(deps: VocReadServiceDeps) {
  const listReaders = createVocListReaders(deps);
  const detailReaders = createVocDetailReaders(deps);
  const referenceReader = createVocReferenceReader(deps, detailReaders.resolveVocAccess);
  const conversationReader = createVocConversationReader(deps);

  return {
    listVocs: listReaders.listVocs,
    countVocs: listReaders.countVocs,
    getVocDetail: detailReaders.getVocDetail,
    resolveVocReference: referenceReader.resolveVocReference,
    getConversation: conversationReader.getConversation,
    composeDetailEnvelope: detailReaders.composeDetailEnvelope,
  };
}

export type VocReadService = ReturnType<typeof createVocReadService>;
