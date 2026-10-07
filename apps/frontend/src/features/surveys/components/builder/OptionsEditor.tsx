import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import { Button, Input } from '@fops/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { SurveyQuestion } from '../../types';
import { createClientId } from './lib/createClientId';
import { MAX, MIN } from './lib/optionValidation';

export function OptionsEditor({
  question,
  editable,
  branchTriggerOptionKeys,
  onChange,
}: {
  question: SurveyQuestion;
  editable: boolean;
  branchTriggerOptionKeys: string[];
  onChange: (patch: Partial<SurveyQuestion>) => void;
}) {
  const options = question.options ?? [];
  const branchTriggerKeys = new Set(branchTriggerOptionKeys);
  const branchNoticeId = `survey-branch-option-reset-${question.id}`;

  const addOption = () => {
    if (!editable || options.length >= MAX) return;
    const lastNumber = options.reduce((maximum, option) => {
      const match = /^옵션 (\d+)$/.exec(option.label.trim());
      return Math.max(maximum, match ? Number(match[1]) : 0);
    }, options.length);
    const key = createClientId('option-');
    onChange({
      options: [...options, { key, label: SURVEY_BUILDER_COPY.optionLabel(lastNumber + 1) }],
    });
  };

  const removeOption = (optionKey: string) => {
    if (!editable || options.length <= MIN) return;
    onChange({ options: options.filter((option) => option.key !== optionKey) });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm">선택지</p>
      {branchTriggerKeys.size > 0 && (
        <p id={branchNoticeId} className="text-xs text-text-muted">
          {SURVEY_BUILDER_COPY.branchOptionResetNotice}
        </p>
      )}
      {options.map((option, index) => {
        const hasEmptyLabel = option.label.trim().length === 0;
        const errorId = `survey-option-error-${question.id}-${index}`;
        const isBranchTrigger = branchTriggerKeys.has(option.key);
        return (
          <div key={option.key} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                aria-label={SURVEY_BUILDER_COPY.optionLabel(index + 1)}
                aria-invalid={hasEmptyLabel}
                {...(hasEmptyLabel ? { 'aria-describedby': errorId } : {})}
                value={option.label}
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    options: options.map((item, current) =>
                      current === index ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
              />
              {hasEmptyLabel && (
                <p id={errorId} role="alert" className="mt-1 text-xs text-text-danger-label">
                  {SURVEY_BUILDER_COPY.emptyOptionLabel}
                </p>
              )}
            </div>
            <div className="flex h-10 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={SURVEY_BUILDER_COPY.optionDeleteLabel(index + 1)}
                {...(isBranchTrigger ? { 'aria-describedby': branchNoticeId } : {})}
                disabled={!editable || options.length <= MIN}
                onClick={() => removeOption(option.key)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!editable || options.length >= MAX}
        onClick={addOption}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {SURVEY_BUILDER_COPY.addOption}
      </Button>
    </div>
  );
}
