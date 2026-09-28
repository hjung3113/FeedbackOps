import type { OutcomeFollowUpReadDto } from '@fops/shared';
import { Link } from '@tanstack/react-router';
import type { Survey } from '../../types';
import { SurveyStatusBadge } from '../SurveyStatusBadge';

export function SurveyResultHeader({
  survey,
  activeTab,
  followUpRead,
}: {
  survey: Survey;
  activeTab: 'results' | 'follow-up';
  followUpRead?: OutcomeFollowUpReadDto | null | undefined;
}) {
  const canReviewResponses = survey.type === 'outcome' && followUpRead?.personal_access === true;
  const openCount =
    survey.type === 'outcome' && followUpRead?.personal_access === true
      ? followUpRead.items.filter((item) => item.resolution === 'open').length
      : 0;
  const tabClass = (active: boolean) =>
    [
      'rounded px-2.5 py-1.5 text-sm',
      active
        ? 'bg-surface-raised font-medium text-text-primary'
        : 'text-text-muted hover:bg-surface-raised hover:text-text-primary',
    ].join(' ');

  return (
    <header
      className={[
        'flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2',
        'border-b border-border-subtle bg-surface-canvas px-5 py-2',
      ].join(' ')}
      data-testid="survey-result-header"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link className="shrink-0 text-text-muted hover:text-text-primary" to="/surveys">
          Surveys /
        </Link>
        <span className="font-mono text-text-muted">{survey.display_id}</span>
        <h1 className="min-w-0 truncate font-semibold text-text-primary">{survey.title}</h1>
        <span
          className={[
            'inline-flex shrink-0 rounded border border-border-subtle px-2 py-0.5',
            'text-xs capitalize text-text-secondary',
          ].join(' ')}
        >
          {survey.type}
        </span>
        <SurveyStatusBadge status={survey.status} />
      </div>
      {/* Two views only exist for personal-response holders; a lone Results tab is noise. */}
      {canReviewResponses && (
        <nav aria-label="Survey result views" className="flex items-center gap-1">
          <Link
            aria-current={activeTab === 'results' ? 'page' : undefined}
            className={tabClass(activeTab === 'results')}
            params={{ surveyId: survey.id }}
            to="/surveys/$surveyId/results"
          >
            Results
          </Link>
          <Link
            aria-current={activeTab === 'follow-up' ? 'page' : undefined}
            className={tabClass(activeTab === 'follow-up')}
            params={{ surveyId: survey.id }}
            to="/surveys/$surveyId/follow-up"
          >
            Follow-up · {openCount}
          </Link>
        </nav>
      )}
    </header>
  );
}
