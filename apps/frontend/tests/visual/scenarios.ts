import type { FindingDto, VocClusterDto } from '@fops/shared';

import {
  IDS,
  candidatePeers,
  confirmedLinkedFinding,
  confirmedNoFinding,
  draftNoFinding,
  emptyList,
  existingFinding,
  populatedList,
} from './fixtures/voc-clusters';
import {
  integrationDashboardEmptySummaryFixture,
  integrationDashboardManagedSystemsFixture,
  integrationDashboardSummaryFixture,
} from './fixtures/integration-dashboard';

export type ScenarioName =
  | 'populated'
  | 'empty-list'
  | 'list-error'
  | 'detail-404'
  | 'detail-error';

export interface VisualScenario {
  list: { status: number; items: VocClusterDto[] };
  details: Record<string, { status: number; cluster?: VocClusterDto }>;
  candidates: typeof candidatePeers;
  findings: FindingDto[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createScenario(name: ScenarioName = 'populated'): VisualScenario {
  const base: VisualScenario = {
    list: { status: 200, items: clone(populatedList.items) },
    details: {
      [IDS.draft]: { status: 200, cluster: clone(draftNoFinding) },
      [IDS.linked]: { status: 200, cluster: clone(confirmedLinkedFinding) },
      [IDS.confirmedNoFinding]: {
        status: 200,
        cluster: clone(confirmedNoFinding),
      },
    },
    candidates: clone(candidatePeers),
    findings: [clone(existingFinding)],
  };

  switch (name) {
    case 'empty-list':
      return { ...base, list: { status: 200, items: clone(emptyList.items) } };
    case 'list-error':
      return { ...base, list: { status: 500, items: [] } };
    case 'detail-404':
      return {
        ...base,
        details: { ...base.details, [IDS.draft]: { status: 404 } },
      };
    case 'detail-error':
      return {
        ...base,
        details: { ...base.details, [IDS.draft]: { status: 500 } },
      };
    default:
      return base;
  }
}

export type IntegrationDashboardScenarioName =
  | 'populated'
  | 'empty'
  | 'request-error'
  | 'permission-denied';

export interface IntegrationDashboardVisualScenario {
  summaryStatus: number;
  summaryBody: unknown;
  managedSystems: unknown;
}

export function createIntegrationDashboardScenario(
  name: IntegrationDashboardScenarioName = 'populated',
): IntegrationDashboardVisualScenario {
  const base: IntegrationDashboardVisualScenario = {
    summaryStatus: 200,
    summaryBody: structuredClone(integrationDashboardSummaryFixture),
    managedSystems: structuredClone(integrationDashboardManagedSystemsFixture),
  };

  switch (name) {
    case 'empty':
      return {
        ...base,
        summaryBody: structuredClone(integrationDashboardEmptySummaryFixture),
      };
    case 'request-error':
      return {
        ...base,
        summaryStatus: 500,
        summaryBody: { code: 'internal.unexpected', message: 'unexpected test error' },
      };
    case 'permission-denied':
      return {
        ...base,
        summaryStatus: 403,
        summaryBody: { code: 'permission.denied', message: 'permission denied' },
      };
    default:
      return base;
  }
}
