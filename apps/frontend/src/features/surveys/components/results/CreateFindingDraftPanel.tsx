import { mapUnknownError } from '@/lib/api/errorMapper';
import { FINDING_SEVERITY_LABELS } from '@/lib/copy/enum-labels';
import { CREATE_OR_LINK_FINDING_LABEL } from '@/lib/copy/glossary';
import {
  type FindingDto,
  type FindingSeverity,
  type SurveyResultDto,
  findingSeveritySchema,
} from '@fops/shared';
import {
  Button,
  Checkbox,
  FieldLabel,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { useState } from 'react';
import { useCreateFindingFromSurveyResponse } from '../../hooks/useCreateFindingFromSurveyResponse';

export type ResponseExcerpt = { id: string; text: string; response_id: string };

export function excerptsByResponse(results: SurveyResultDto): ResponseExcerpt[][] {
  const grouped = new Map<string, ResponseExcerpt[]>();
  for (const question of results.questions) {
    if (question.visibility !== 'visible' || question.kind !== 'text') continue;
    for (const excerpt of question.excerpts) {
      if (!excerpt.response_id) continue;
      const group = grouped.get(excerpt.response_id) ?? [];
      group.push({ ...excerpt, response_id: excerpt.response_id });
      grouped.set(excerpt.response_id, group);
    }
  }
  return [...grouped.values()];
}

export function CreateFindingDraftPanel({
  surveyId,
  groups,
  scopedResponseId,
  onCreated,
}: {
  surveyId: string;
  groups: ResponseExcerpt[][];
  scopedResponseId?: string | undefined;
  onCreated?: ((finding: FindingDto, responseId: string) => void) | undefined;
}) {
  const [selection, setSelection] = useState<{ responseId?: string; excerptIds: string[] }>(() => ({
    ...(scopedResponseId ? { responseId: scopedResponseId } : {}),
    excerptIds: [],
  }));
  const [severity, setSeverity] = useState<FindingSeverity>('medium');
  const mutation = useCreateFindingFromSurveyResponse(surveyId, (finding, variables) =>
    onCreated?.(finding, variables.responseId),
  );
  const selectedGroup = groups.find((group) => group[0]?.response_id === selection.responseId);
  const selectedExcerptIds = selection.excerptIds.filter((id) =>
    selectedGroup?.some((excerpt) => excerpt.id === id),
  );

  function selectResponse(nextResponseId: string) {
    setSelection({ responseId: nextResponseId, excerptIds: [] });
  }

  function setExcerptSelected(id: string, checked: boolean) {
    setSelection((current) => ({
      ...current,
      excerptIds: checked
        ? [...current.excerptIds, id]
        : current.excerptIds.filter((excerptId) => excerptId !== id),
    }));
  }

  function submit() {
    if (!selectedGroup || selectedExcerptIds.length === 0) return;
    const first = selectedGroup[0];
    if (!first) return;
    mutation.mutate({
      responseId: first.response_id,
      body: { severity, approved_excerpt_ids: selectedExcerptIds },
    });
  }

  return (
    <section
      className="mt-3 space-y-3 border-t border-border-subtle pt-3"
      data-testid="survey-create-finding-draft"
    >
      <p className="text-sm font-medium text-text-primary">{CREATE_OR_LINK_FINDING_LABEL}</p>
      {scopedResponseId ? (
        <p className="text-sm text-text-secondary">선택한 응답의 승인된 발췌</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm text-text-secondary" id="survey-finding-response-label">
            응답 선택
          </legend>
          <RadioGroup
            aria-labelledby="survey-finding-response-label"
            onValueChange={selectResponse}
            value={selection.responseId ?? ''}
          >
            {groups.map((group, index) => {
              const first = group[0];
              if (!first) return null;
              return (
                <label
                  className="flex items-center gap-2 text-sm text-text-secondary"
                  htmlFor={`survey-finding-response-${first.response_id}`}
                  key={first.response_id}
                >
                  <RadioGroupItem
                    data-testid={`survey-finding-response-${index}`}
                    id={`survey-finding-response-${first.response_id}`}
                    value={first.response_id}
                  />
                  응답 {index + 1}
                </label>
              );
            })}
          </RadioGroup>
        </fieldset>
      )}
      {scopedResponseId && !selectedGroup ? (
        <p className="text-sm text-text-muted">접근 가능한 응답에 승인된 발췌가 없습니다.</p>
      ) : (
        selectedGroup && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-text-secondary">승인된 발췌</legend>
            {selectedGroup.map((excerpt) => (
              <label
                className="flex gap-2 text-sm text-text-secondary"
                htmlFor={`survey-finding-excerpt-${excerpt.id}`}
                key={excerpt.id}
              >
                <Checkbox
                  checked={selectedExcerptIds.includes(excerpt.id)}
                  data-testid={`survey-finding-excerpt-${excerpt.id}`}
                  id={`survey-finding-excerpt-${excerpt.id}`}
                  onCheckedChange={(checked) => setExcerptSelected(excerpt.id, checked === true)}
                />
                <span>{excerpt.text}</span>
              </label>
            ))}
          </fieldset>
        )
      )}
      <FieldLabel
        tone="secondary"
        className={
          // oxlint-disable-next-line shadcn/no-restyle -- re-applying text-sm makes cn drop Label's leading-none, so this label keeps the body line height beside its select
          'block text-sm'
        }
        htmlFor="survey-finding-severity"
        id="survey-finding-severity-label"
      >
        심각도
      </FieldLabel>
      <Select onValueChange={(value) => setSeverity(value as FindingSeverity)} value={severity}>
        <SelectTrigger
          aria-labelledby="survey-finding-severity-label"
          className="mt-1"
          data-testid="survey-finding-severity"
          id="survey-finding-severity"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {findingSeveritySchema.options.map((value) => (
            <SelectItem key={value} value={value}>
              {FINDING_SEVERITY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.error && (
        <p className="text-sm text-text-danger" role="alert">
          {mapUnknownError(mutation.error).message}
        </p>
      )}
      <Button
        data-testid="survey-create-finding-submit"
        disabled={!selectedGroup || selectedExcerptIds.length === 0}
        loading={mutation.isPending}
        onClick={submit}
        type="button"
      >
        선택한 응답으로 Finding 생성
      </Button>
    </section>
  );
}
