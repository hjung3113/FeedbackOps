import { SURVEY_PARTICIPATION_COPY } from '@/lib/copy/survey-participation';
import type { SurveyQuestionKind } from '@fops/shared';
import { Textarea } from '@fops/ui';

export type RespondentAnswer = string | string[] | number;

export interface RespondentQuestionData {
  id: string;
  kind: SurveyQuestionKind;
  prompt: string;
  options: Array<{ key: string; label: string }> | null;
  rating_min: number | null;
  rating_max: number | null;
  rating_low_label: string | null;
  rating_high_label: string | null;
}

export function RespondentQuestion({
  question,
  value,
  onChange,
}: {
  question: RespondentQuestionData;
  value: RespondentAnswer | undefined;
  onChange: (value: RespondentAnswer) => void;
}) {
  if (question.kind === 'text') {
    return (
      <Textarea
        aria-label={question.prompt}
        className="mt-2 min-h-24"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={SURVEY_PARTICIPATION_COPY.textPlaceholder}
      />
    );
  }

  if (question.kind === 'rating') {
    const minimum = question.rating_min ?? 1;
    const maximum = question.rating_max ?? 5;
    return (
      <fieldset className="mt-2 space-y-2">
        <legend className="sr-only">{question.prompt}</legend>
        <div className="flex gap-2">
          {Array.from({ length: Math.max(0, maximum - minimum + 1) }, (_, index) => {
            const score = minimum + index;
            const selected = value === score;
            return (
              <label
                key={score}
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ring-offset-surface-canvas has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring has-[:focus-visible]:ring-offset-2 ${selected ? 'border-border-selected bg-surface-row-selected' : 'border-border-subtle'}`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={question.id}
                  value={score}
                  checked={selected}
                  onChange={() => onChange(score)}
                />
                {score}
              </label>
            );
          })}
        </div>
        <div className="flex justify-between gap-2 text-xs text-text-muted">
          <span>{question.rating_low_label}</span>
          <span>{question.rating_high_label}</span>
        </div>
      </fieldset>
    );
  }

  const multiple = question.kind === 'multiple_choice';
  return (
    <fieldset className="mt-2 space-y-2">
      <legend className="sr-only">{question.prompt}</legend>
      {(question.options ?? []).map((option) => {
        const checked = multiple
          ? Array.isArray(value) && value.includes(option.key)
          : value === option.key;
        return (
          <label key={option.key} className="flex gap-2 text-sm">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={question.id}
              checked={checked}
              onChange={() => {
                if (!multiple) {
                  onChange(option.key);
                  return;
                }
                const current = Array.isArray(value) ? value : [];
                onChange(
                  checked
                    ? current.filter((item) => item !== option.key)
                    : [...current, option.key],
                );
              }}
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
