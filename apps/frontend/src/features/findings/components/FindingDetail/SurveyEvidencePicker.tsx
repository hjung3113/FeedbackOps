import { ApiError } from '@/lib/api';
import { SURVEY_EVIDENCE_PICKER_COPY as COPY } from '@/lib/copy/survey-evidence-picker';
import { useManagedSystemNames } from '@/lib/cross-system/useManagedSystemNames';
import { Button, Combobox, FieldLabel, RadioGroup, RadioGroupItem } from '@fops/ui';
import { useEffect } from 'react';
import {
  useSurveyEvidenceCandidates,
  useSurveyEvidenceCatalog,
} from '../../hooks/useSurveyEvidence';

interface Props {
  managedSystemId: string;
  surveyId: string | null;
  value: string | null;
  disabled: boolean;
  onSurveyChange: (id: string) => void;
  onChange: (id: string | null) => void;
}

export function SurveyEvidencePicker({
  managedSystemId,
  surveyId,
  value,
  disabled,
  onSurveyChange,
  onChange,
}: Props) {
  const systemNames = useManagedSystemNames();
  const catalog = useSurveyEvidenceCatalog();
  const candidates = useSurveyEvidenceCandidates(surveyId);
  // Never retain previews from a source whose current read failed or was suppressed.
  const unavailable =
    candidates.isError &&
    (!candidates.isFetchNextPageError ||
      (candidates.error instanceof ApiError &&
        [403, 404, 409, 422].includes(candidates.error.status)));
  const pages = unavailable ? [] : (candidates.data?.pages ?? []);
  const items = pages.some((page) => page.response_state !== 'visible')
    ? []
    : pages.flatMap((page) => page.items);
  const suppressedPage = pages.find((page) => page.response_state !== 'visible');
  const state = suppressedPage?.response_state ?? pages[0]?.response_state;
  const eligible = value !== null && items.some((item) => item.approved_excerpt_id === value);
  useEffect(() => {
    if (value !== null && (unavailable || (candidates.isSuccess && !eligible))) onChange(null);
  }, [value, unavailable, candidates.isSuccess, eligible, onChange]);

  const error = candidates.error;
  const errorCopy =
    error instanceof ApiError && (error.status === 404 || error.status === 403)
      ? COPY.denied
      : error instanceof ApiError && error.status === 409
        ? COPY.draft
        : COPY.error;

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel required htmlFor="evidence-source-survey">
        {COPY.survey}
      </FieldLabel>
      <Combobox
        id="evidence-source-survey"
        value={surveyId}
        disabled={disabled}
        onChange={onSurveyChange}
        options={(catalog.isError ? [] : (catalog.data ?? [])).map((survey) => ({
          value: survey.id,
          label: `${survey.display_id} · ${survey.title}${survey.primary_managed_system_id !== managedSystemId ? ` · Managed System: ${systemNames.get(survey.primary_managed_system_id) ?? survey.primary_managed_system_id}` : ''}`,
        }))}
        placeholder={COPY.survey}
        searchPlaceholder={COPY.search}
        listboxLabel={COPY.survey}
        emptyText={catalog.isPending ? COPY.loading : COPY.catalogEmpty}
      />
      {catalog.isPending && <output className="text-xs text-text-muted">{COPY.loading}</output>}
      {catalog.isError && (
        <>
          <p role="alert" className="text-xs text-text-danger">
            {COPY.error}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => void catalog.refetch()}
          >
            {COPY.retry}
          </Button>
        </>
      )}
      {catalog.isSuccess && catalog.data.length === 0 && (
        <>
          <output className="text-xs text-text-muted">{COPY.catalogEmpty}</output>
          <p className="text-xs text-text-muted">{COPY.catalogAccessHint}</p>
        </>
      )}
      {surveyId !== null && (
        <>
          {candidates.isPending && (
            <output className="text-xs text-text-muted">{COPY.loading}</output>
          )}
          {candidates.isError && (
            <>
              <p role="alert" className="text-xs text-text-danger">
                {errorCopy}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={disabled || candidates.isFetching}
                onClick={() =>
                  void (candidates.isFetchNextPageError
                    ? candidates.fetchNextPage()
                    : candidates.refetch())
                }
              >
                {COPY.retry}
              </Button>
            </>
          )}
          {state !== undefined && items.length === 0 && (
            <output className="text-xs text-text-muted">
              {state === 'visible' ? COPY.empty : COPY[state]}
            </output>
          )}
          {items.length > 0 && (
            <>
              <FieldLabel>{COPY.excerpt}</FieldLabel>
              <div className="max-h-48 overflow-y-auto">
                <RadioGroup
                  aria-label={COPY.excerpt}
                  value={eligible ? value : ''}
                  disabled={disabled}
                  onValueChange={onChange}
                >
                  {items.map((item) => (
                    <label
                      htmlFor={`survey-excerpt-${item.approved_excerpt_id}`}
                      key={item.approved_excerpt_id}
                      className="flex items-start gap-2"
                    >
                      <RadioGroupItem
                        id={`survey-excerpt-${item.approved_excerpt_id}`}
                        value={item.approved_excerpt_id}
                      />
                      <span className="flex flex-col gap-1">
                        <span className="text-xs text-text-muted">
                          {item.question_label}
                          {item.identity_protected ? ` · ${COPY.protected}` : ''}
                        </span>
                        <span className="text-sm">{item.redacted_excerpt}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}
          {candidates.hasNextPage && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={disabled || candidates.isFetching}
              onClick={() => void candidates.fetchNextPage()}
            >
              {COPY.more}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
