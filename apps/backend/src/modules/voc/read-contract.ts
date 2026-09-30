import type { ListVocsQuery } from '@fops/shared';

import type { Scope } from './authorization.js';
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
export type VocGroupedCountRow = {
  managed_system_id: string;
  analytics_area_id: string | null;
  total: number;
  unassigned: number;
  high_no_link: number;
  high_severity: number;
  with_task: number;
};
export type VocGroupedCountReader = Pick<VocReadService, 'countGroupedVocs'>;
export type VocGroupedCountArgs = {
  actor: {
    actor_id: string;
    workspace_id: string;
    role_level: 'admin' | 'developer' | 'user';
  };
  readScope: Scope;
  managedSystemId?: string;
};
export type VocReferenceReader = Pick<VocReadService, 'resolveVocReference'>;
export type VocDetailReader = Pick<VocReadService, 'getVocDetail'>;
