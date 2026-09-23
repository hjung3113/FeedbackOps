// VOC module controller. Thin per apps/backend/AGENTS.md Layer Rules (#392):
// HTTP parsing + forbidden-field stripping + request-hash computation; the
// application commands own the transaction, the idempotency frame, business
// rules + audit.

import type { FastifyPluginAsync } from 'fastify';

import type { SessionService } from '../../auth/session-service.js';
import type { FindingsService } from '../../findings/index.js';
import type { TaskRequestsService } from '../../task-requests/index.js';
import type { ConversationService } from '../conversation-service.js';
import type { PublicUpdateReviewCandidateService } from '../public-update-review-candidates/review-service.js';
import type { VocReadService } from '../read-service.js';
import type { VocService } from '../service.js';
import { vocConversationRoutes } from './conversation.js';
import { vocConversionRoutes } from './conversion.js';
import { vocCrudRoutes } from './crud.js';
import { vocPublicUpdatesRoutes } from './public-updates.js';

export interface VocRoutesOptions {
  sessionService: SessionService;
  vocService: VocService;
  vocReadService: VocReadService;
  findingsService: FindingsService;
  taskRequestsService: TaskRequestsService;
  conversationService: ConversationService;
  publicUpdateReviewCandidateService: PublicUpdateReviewCandidateService;
  workspaceId: string;
  rateLimitConfig?: {
    mutation: Record<string, unknown>;
    read?: Record<string, unknown>;
    reporterEdit?: Record<string, unknown>;
  };
}

export const vocRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  await app.register(vocPublicUpdatesRoutes, opts);
  await app.register(vocConversionRoutes, opts);
  await app.register(vocCrudRoutes, opts);
  await app.register(vocConversationRoutes, opts);
};
