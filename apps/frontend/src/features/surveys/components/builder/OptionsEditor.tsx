import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import { SURVEY_CHOICE_OPTIONS_MAX, SURVEY_CHOICE_OPTIONS_MIN } from '@fops/shared';
import { Button, Input } from '@fops/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { SurveyQuestion } from '../../types';

let nextOptionKeySequence = 0;

function createOptionKey(): string {
  nextOptionKeySequence += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `option-${crypto.randomUUID()}-${nextOptionKeySequence}`;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const randomParts = crypto.getRandomValues(new Uint32Array(4));
    return `option-${Array.from(randomParts, (part) => part.toString(36)).join('-')}-${nextOptionKeySequence}`;
  }
  return `option-${Date.now().toString(36)}-${nextOptionKeySequence.toString(36)}`;
}

export function OptionsEditor({
  question,
  editable,
  hasBranchedChildren,
  onChange,
}: {
  question: SurveyQuestion;
  editable: boolean;
  hasBranchedChildren: boolean;
  onChange: (patch: Partial<SurveyQuestion>) => void;
}) {
  const options = question.options ?? [];

  const addOption = () => {
    if (!editable || options.length >= SURVEY_CHOICE_OPTIONS_MAX) return;
    const lastNumber = options.reduce((maximum, option) => {
      const match = /^옵션 (\d+)$/.exec(option.label.trim());
      return Math.max(maximum, match ? Number(match[1]) : 0);
    }, options.length);
    const key = createOptionKey();
    onChange({
      options: [...options, { key, label: `옵션 ${lastNumber + 1}` }],
    });
  };

  const removeOption = (optionKey: string) => {
    if (!editable || options.length <= SURVEY_CHOICE_OPTIONS_MIN) return;
    onChange({ options: options.filter((option) => option.key !== optionKey) });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm">선택지</p>
      {hasBranchedChildren && (
        <p className="text-xs text-text-muted">{SURVEY_BUILDER_COPY.branchOptionResetNotice}</p>
      )}
      {options.map((option, index) => {
        const hasEmptyLabel = option.label.trim().length === 0;
        const errorId = `survey-option-error-${question.id}-${index}`;
        return (
          <div key={option.key} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                aria-label={`옵션 ${index + 1}`}
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
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`옵션 ${index + 1} 삭제`}
              disabled={!editable || options.length <= SURVEY_CHOICE_OPTIONS_MIN}
              onClick={() => removeOption(option.key)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!editable || options.length >= SURVEY_CHOICE_OPTIONS_MAX}
        onClick={addOption}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        옵션 추가
      </Button>
    </div>
  );
}
