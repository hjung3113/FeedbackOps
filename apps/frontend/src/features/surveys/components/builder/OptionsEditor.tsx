import { Input } from '@fops/ui';
import type { SurveyQuestion } from '../../types';

export function OptionsEditor({
  question,
  editable,
  onChange,
}: {
  question: SurveyQuestion;
  editable: boolean;
  onChange: (patch: Partial<SurveyQuestion>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm">Options</p>
      {(question.options ?? []).map((option, index) => (
        <Input
          key={option.key}
          value={option.label}
          disabled={!editable}
          onChange={(event) =>
            onChange({
              options: (question.options ?? []).map((item, current) =>
                current === index ? { ...item, label: event.target.value } : item,
              ),
            })
          }
        />
      ))}
    </div>
  );
}
