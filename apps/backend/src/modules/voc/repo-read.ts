// apps/backend/src/modules/voc/repo-read.ts
//
// Read repo layer for the VOC module. Pure SQL/drizzle reads on voc.* tables.
// No route handlers, no service-layer logic.
//
// Scope resolution and similarVocVisibilityPredicate live in ./authorization.ts;
// this file is read SQL on voc.* plus the managed-system id projection
// outOfScopeSummary already uses. Do not import permission schema here either.

export type { VocReadRow } from './read/repository-shared.js';

export {
  buildVocListPredicate,
  countVocsForRead,
  listVocsForRead,
  outOfScopeSummary,
} from './read/repository-list.js';
export type { ListVocsRepoArgs } from './read/repository-list.js';

export {
  selectVocByIdForRead,
  selectPinnedVocListRow,
  selectPermissionDecisionsSeed,
} from './read/repository-detail.js';

export { selectConversationPage } from './read/repository-conversation.js';
export type {
  ConversationKind,
  ConversationRow,
  SelectConversationPageArgs,
} from './read/repository-conversation.js';

export {
  selectVocAttachments,
  selectAttachmentsForComments,
  selectVocAttachmentCounts,
} from './read/repository-attachments.js';
export type { LinkedAttachmentReadRow } from './read/repository-attachments.js';

export {
  selectSimilarVocCounts,
  selectSimilarVocCount,
  selectSimilarVocItems,
} from './read/repository-similar.js';
export type { SimilarVocReadItem } from './read/repository-similar.js';
