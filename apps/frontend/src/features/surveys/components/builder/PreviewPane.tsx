import { Button, Textarea } from '@fops/ui';
import * as React from 'react';
import type { Survey, SurveyQuestion } from '../../types';

export function PreviewPane({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const [answers, setAnswers] = React.useState<Record<string, string | string[] | number>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const questions = (survey.questions ?? []).filter((question) => {
    if (!question.branch_parent_question_id || !question.branch_trigger_option_key) return true;
    const answer = answers[question.branch_parent_question_id];
    return Array.isArray(answer)
      ? answer.includes(question.branch_trigger_option_key)
      : answer === question.branch_trigger_option_key;
  });
  return (
    <dialog
      open
      className="fixed inset-0 z-50 grid grid-cols-[1fr_480px] bg-black/20"
      aria-label="Respondent preview"
    >
      <button type="button" aria-label="미리보기 닫기" onClick={onClose} />
      <section className="overflow-auto bg-surface-canvas p-6">
        <div className="flex justify-between">
          <p className="text-sm font-medium">Respondent preview</p>
          <Button size="sm" variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
        {submitted ? (
          <div className="mt-10 text-center">
            <p className="font-medium">응답이 제출되었습니다</p>
            <p className="mt-2 text-sm text-text-muted">
              미리보기 — 실제 응답은 저장되지 않습니다.
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
            <h2 className="mt-6 text-xl font-semibold">{survey.title || '제목 없음'}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {survey.description || '아직 설명이 추가되지 않았습니다.'}
            </p>
            <p className="mt-3 rounded bg-surface-detail p-3 text-sm">
              익명성 안내 ·{' '}
              {survey.responses_identity_protected
                ? '응답은 익명으로 처리되며 개인을 식별할 수 없습니다.'
                : '응답에 개인 식별자가 포함될 수 있으니 관련 정책을 확인하세요.'}
            </p>
            <div className="mt-6 space-y-6">
              {questions.map((question) => (
                <div key={question.id}>
                  <p className="text-sm font-medium">
                    Q{(survey.questions ?? []).indexOf(question) + 1}.{' '}
                    {question.prompt || '제목 없음'}
                    {question.is_required && ' *'}
                  </p>
                  <PreviewInput
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <footer className="mt-8 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-text-muted">
              <span>
                {questions.length}개 질문 · {Object.keys(answers).length}개 응답
              </span>
              <Button size="sm" onClick={() => setSubmitted(true)}>
                제출 (미리보기)
              </Button>
            </footer>
          </>
        )}
      </section>
    </dialog>
  );
}

function PreviewInput({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: string | string[] | number | undefined;
  onChange: (value: string | string[] | number) => void;
}) {
  if (question.kind === 'text')
    return (
      <Textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder="자유롭게 적어주세요…"
      />
    );
  if (question.kind === 'rating')
    return (
      <div className="mt-2 flex gap-2">
        {Array.from(
          {
            length: (question.rating_max ?? 5) - (question.rating_min ?? 1) + 1,
          },
          (_, index) => {
            const score = (question.rating_min ?? 1) + index;
            return (
              <button
                key={score}
                type="button"
                aria-pressed={value === score}
                onClick={() => onChange(score)}
                className="h-8 w-8 rounded-full border border-border-subtle"
              >
                {score}
              </button>
            );
          },
        )}
      </div>
    );
  return (
    <div className="mt-2 space-y-2">
      {(question.options ?? []).map((option) => {
        const checked =
          question.kind === 'single_choice'
            ? value === option.key
            : Array.isArray(value) && value.includes(option.key);
        return (
          <label key={option.key} className="flex gap-2 text-sm">
            <input
              type={question.kind === 'single_choice' ? 'radio' : 'checkbox'}
              name={question.id}
              checked={checked}
              onChange={() => {
                if (question.kind === 'single_choice') onChange(option.key);
                else {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    checked
                      ? current.filter((item) => item !== option.key)
                      : [...current, option.key],
                  );
                }
              }}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
