import { EmptyState } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import type { Survey } from '../../types';

export function SurveyDetail({ survey, canManage }: { survey: Survey; canManage: boolean }) {
  const questions = survey.questions ?? [];
  return <aside className="flex h-full flex-col border-l border-border-subtle bg-surface-detail p-5" data-testid="survey-detail">
    <div className="space-y-2"><p className="text-xs text-text-muted">{survey.display_id} · {survey.type}</p><h1 className="text-lg font-semibold text-text-primary">{survey.title}</h1><p className="text-sm text-text-muted">{survey.description || '설명이 없습니다.'}</p><span className="inline-flex rounded-full bg-surface-canvas px-2 py-1 text-xs">{survey.status}</span></div>
    <div className="mt-6 flex-1"><h2 className="mb-2 text-sm font-medium">Questions</h2>{questions.length ? <ol className="space-y-2">{questions.map((question, index) => <li key={question.id} className="text-sm text-text-secondary">Q{index + 1}. {question.prompt}</li>)}</ol> : <EmptyState size="sm" title="질문이 없습니다." />}</div>
    {canManage && survey.status === 'draft' && <Link to="/surveys/$surveyId" params={{ surveyId: survey.id }} search={{ builder: true }} className="rounded-md bg-accent-primary px-3 py-2 text-center text-sm font-medium text-white">Continue building</Link>}
  </aside>;
}
