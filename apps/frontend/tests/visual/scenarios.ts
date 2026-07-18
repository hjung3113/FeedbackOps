import type { FindingDto, VocClusterDto } from "@fops/shared";

import {
  IDS,
  candidatePeers,
  confirmedLinkedFinding,
  confirmedNoFinding,
  draftNoFinding,
  emptyList,
  existingFinding,
  populatedList,
} from "./fixtures/voc-clusters";

export type ScenarioName =
  | "populated"
  | "empty-list"
  | "list-error"
  | "detail-404"
  | "detail-error";

export interface VisualScenario {
  list: { status: number; items: VocClusterDto[] };
  details: Record<string, { status: number; cluster?: VocClusterDto }>;
  candidates: typeof candidatePeers;
  findings: FindingDto[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createScenario(
  name: ScenarioName = "populated",
): VisualScenario {
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
    case "empty-list":
      return { ...base, list: { status: 200, items: clone(emptyList.items) } };
    case "list-error":
      return { ...base, list: { status: 500, items: [] } };
    case "detail-404":
      return {
        ...base,
        details: { ...base.details, [IDS.draft]: { status: 404 } },
      };
    case "detail-error":
      return {
        ...base,
        details: { ...base.details, [IDS.draft]: { status: 500 } },
      };
    default:
      return base;
  }
}
