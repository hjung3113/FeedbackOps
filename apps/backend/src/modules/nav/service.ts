import { HttpError } from '../../lib/errors.js';
import type { CountVocsQuery } from '../voc/read-service.js';

export interface NavActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

type NavCountsDeps = {
  vocReadService: {
    countVocs(args: { actor: NavActor; query: CountVocsQuery }): Promise<number>;
  };
  findingsService: {
    listFindings(args: { actor: NavActor; managedSystemId?: string }): Promise<{ items: readonly unknown[] }>;
  };
  surveysService: {
    listSurvey(actor: NavActor, managedSystemId?: string): Promise<readonly unknown[]>;
  };
  vocClustersService: {
    listClusters(args: { actor: NavActor; managedSystemId?: string }): Promise<{ items: readonly unknown[] }>;
  };
};

function isAuthorizationAbsence(error: unknown): error is HttpError {
  return error instanceof HttpError
    && (error.code === 'permission.denied' || error.code === 'permission.scope_required');
}

export function createNavCountsService(deps: NavCountsDeps) {
  async function getCounts(actor: NavActor, managedSystemId?: string): Promise<Record<string, number>> {
    const query = (view: CountVocsQuery['view'], tab?: CountVocsQuery['tab']): CountVocsQuery => ({
      view,
      ...(managedSystemId !== undefined ? { managed_system_id: managedSystemId } : {}),
      ...(tab !== undefined ? { tab } : {}),
    });
    const count = (view: CountVocsQuery['view'], tab?: CountVocsQuery['tab']) =>
      deps.vocReadService.countVocs({ actor, query: query(view, tab) });
    const vocCountEntries = [
      ['voc.inbox', 'inbox'],
      ['voc.triage', 'triage'],
      ['voc.my', 'my'],
      ['voc.tab.high', 'inbox', 'high'],
      ['voc.tab.unassigned', 'inbox', 'unassigned'],
      ['voc.tab.no-link', 'inbox', 'no-link'],
    ] as const;
    const vocCounts = Object.fromEntries((await Promise.all(vocCountEntries.map(async ([key, view, tab]) => {
      try {
        return [key, await count(view, tab)] as const;
      } catch (error) {
        if (isAuthorizationAbsence(error)) return undefined;
        throw error;
      }
    }))).flatMap((entry) => entry === undefined ? [] : [entry]));
    const [findings, surveys, vocClusters] = await Promise.all([
      deps.findingsService.listFindings({ actor, ...(managedSystemId ? { managedSystemId } : {}) }),
      deps.surveysService.listSurvey(actor, managedSystemId),
      deps.vocClustersService.listClusters({ actor, ...(managedSystemId ? { managedSystemId } : {}) }),
    ]);
    return {
      ...vocCounts,
      'findings.all': findings.items.length,
      'surveys.all': surveys.length,
      'voc.clusters': vocClusters.items.length,
    };
  }
  return { getCounts };
}

export type NavCountsService = ReturnType<typeof createNavCountsService>;
