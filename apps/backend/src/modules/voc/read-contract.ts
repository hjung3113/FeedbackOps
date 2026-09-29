import type { ListVocsQuery } from '@fops/shared';

import type { VocReadService } from './read-service.js';

/** Count queries use the same predicates as the list, without list-only fields. */
export type CountVocsQuery = Pick<
  ListVocsQuery,
  | 'view'
  | 'managed_system_id'
  | 'tab'
  | 'filter.severity'
  | 'filter.reporter_facing_status'
  | 'filter.owner'
> & { analyticsAreaId?: string };

export type VocCountReader = Pick<VocReadService, 'countVocs'>;
export type VocReferenceReader = Pick<VocReadService, 'resolveVocReference'>;
export type VocDetailReader = Pick<VocReadService, 'getVocDetail'>;
