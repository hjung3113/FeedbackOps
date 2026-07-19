import { EmptyState, Skeleton } from '@fops/ui';
import type { Survey } from '../../types';

const statusLabel: Record<Survey['status'], string> = { draft: 'Draft', live: 'Live', closed: 'Closed' };

export function SurveyList({ surveys, isLoading, error, onSelect }: {
  surveys: Survey[]; isLoading: boolean; error: Error | null; onSelect: (id: string) => void;
}) {
  if (isLoading) return <div className="space-y-2 p-4" data-testid="survey-list-skeleton"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
  if (error) return <div className="p-6 text-sm text-text-muted" data-testid="survey-list-error">데이터를 불러오지 못했습니다.</div>;
  if (surveys.length === 0) return <EmptyState title="생성된 설문이 없습니다." body="설문을 만들어 응답을 수집하세요." />;
  return <div className="divide-y divide-border-subtle" data-testid="survey-list">
    {surveys.map((survey) => <button key={survey.id} type="button" onClick={() => onSelect(survey.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-card" data-testid={`survey-row-${survey.id}`}>
      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-text-primary">{survey.title}</span><span className="text-xs text-text-muted">{survey.display_id} · {survey.type}</span></span>
      <span className="rounded-full bg-surface-detail px-2 py-1 text-xs text-text-secondary">{statusLabel[survey.status]}</span>
    </button>)}
  </div>;
}
