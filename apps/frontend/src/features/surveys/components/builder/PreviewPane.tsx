import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@fops/ui';
import { Eye } from 'lucide-react';
import * as React from 'react';

import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import {
  SURVEY_PARTICIPATION_COPY,
  respondentIdentityNotice,
} from '@/lib/copy/survey-participation';
import type { Survey } from '../../types';
import { type RespondentAnswer, RespondentQuestion } from '../respond/RespondentQuestion';
import { getVisibleRespondentQuestions } from '../respond/branching';
import { countNonEmptyRespondentAnswers } from '../respond/progress';

export function PreviewPane({
  survey,
  open,
  onOpenChange,
}: {
  survey: Survey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="subtle" size="sm">
          <Eye className="h-4 w-4" />
          미리보기
        </Button>
      </DialogTrigger>
      {/* oxlint-disable-next-line shadcn/no-restyle -- survey preview dialog draws a phone-width canvas */}
      <DialogContent className="max-h-[90vh] max-w-[480px] overflow-hidden bg-surface-canvas p-0">
        <PreviewSheet survey={survey} />
      </DialogContent>
    </Dialog>
  );
}

function PreviewSheet({ survey }: { survey: Survey }) {
  const [answers, setAnswers] = React.useState<Record<string, RespondentAnswer>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const allQuestions = survey.questions ?? [];
  const questions = getVisibleRespondentQuestions(allQuestions, answers);

  return (
    <section className="max-h-[90vh] overflow-y-auto bg-surface-canvas p-6">
      {/* oxlint-disable-next-line shadcn/no-restyle -- compact preview label above the survey title */}
      <DialogTitle className="text-sm font-medium">
        {SURVEY_PARTICIPATION_COPY.previewTitle}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {SURVEY_PARTICIPATION_COPY.previewDescription}
      </DialogDescription>
      {submitted ? (
        <div className="mt-10 text-center">
          <p className="font-medium">{SURVEY_PARTICIPATION_COPY.submitted}</p>
          <p className="mt-2 text-sm text-text-muted">
            {SURVEY_PARTICIPATION_COPY.previewDescription}
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
          >
            다시 시작
          </Button>
        </div>
      ) : (
        <>
          <h2 className="mt-6 text-xl font-semibold">
            {survey.title || SURVEY_PARTICIPATION_COPY.titleMissing}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {survey.description || SURVEY_PARTICIPATION_COPY.descriptionMissing}
          </p>
          <p className="mt-3 rounded bg-surface-detail p-3 text-sm">
            {SURVEY_PARTICIPATION_COPY.anonymityNotice} ·{' '}
            {respondentIdentityNotice(survey.responses_identity_protected)}
          </p>
          <div className="mt-6 space-y-6">
            {questions.map((question) => (
              <div key={question.id}>
                <p className="text-sm font-medium" id={`respondent-question-label-${question.id}`}>
                  Q{allQuestions.indexOf(question) + 1}.{' '}
                  <span className={question.prompt.trim() ? '' : 'font-normal text-text-muted'}>
                    {question.prompt.trim()
                      ? question.prompt
                      : SURVEY_BUILDER_COPY.questionTitleMissing}
                  </span>
                  {question.is_required && ' *'}
                </p>
                <RespondentQuestion
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) =>
                    setAnswers((current) => ({ ...current, [question.id]: value }))
                  }
                />
              </div>
            ))}
          </div>
          <footer className="mt-8 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-text-muted">
            <span>
              {SURVEY_PARTICIPATION_COPY.questionCount(questions.length)} ·{' '}
              {SURVEY_PARTICIPATION_COPY.responseCount(
                countNonEmptyRespondentAnswers(questions, answers),
              )}
            </span>
            <Button size="sm" onClick={() => setSubmitted(true)}>
              {SURVEY_PARTICIPATION_COPY.previewSubmit}
            </Button>
          </footer>
        </>
      )}
    </section>
  );
}
