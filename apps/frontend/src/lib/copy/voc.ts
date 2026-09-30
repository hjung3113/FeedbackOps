// #582 / ADR-0031 replaces the prototype's old "similar" wording for this heuristic.
export const SAME_MANAGED_SYSTEM_VOC_LABEL = '같은 Managed System의 VOC';
export const SEMANTIC_VOC_RECOMMENDATIONS_LABEL = '유사 VOC 추천';

export function formatSameManagedSystemVocCount(count: number): string {
  return `${SAME_MANAGED_SYSTEM_VOC_LABEL} ${count}건`;
}
