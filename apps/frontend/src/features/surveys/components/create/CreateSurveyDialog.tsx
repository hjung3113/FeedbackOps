import {
  ApiError,
  fetchAnalyticsAreas,
  fetchCapabilityScope,
  fetchManagedSystems,
} from '@/lib/api';
import { SURVEY_STATUS_LABELS, SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { SURVEY_START_COPY as COPY } from '@/lib/copy/survey-builder';
import {
  type SurveyCopySourceQuestion,
  type SurveyStartingPoint,
  surveyTypeSchema,
} from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import {
  useCreateSurvey,
  useSurveyCopySource,
  useSurveyCopySources,
  useSurveyTemplates,
} from '../../hooks/useSurveys';
import type { SurveyType } from '../../types';

export function CreateSurveyDialog({
  open,
  onClose,
  onCreated,
  canManage = true,
}: {
  open: boolean;
  canManage?: boolean;
  onClose: () => void;
  onCreated: (surveyId: string) => void;
}) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<SurveyType | ''>('');
  const [system, setSystem] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [analyticsArea, setAnalyticsArea] = React.useState('');
  const [identityProtected, setIdentityProtected] = React.useState<'true' | 'false' | ''>('');
  const create = useCreateSurvey();
  const submitting = React.useRef(false);
  const opener = React.useRef<HTMLElement | null>(null);
  const pinnedStart = React.useRef<SurveyStartingPoint | null>(null);
  const [mode, setMode] = React.useState<'blank' | 'builtin' | 'existing'>('blank');
  const [search, setSearch] = React.useState('');
  const [templateId, setTemplateId] = React.useState('');
  const [sourceId, setSourceId] = React.useState('');
  const [blocked, setBlocked] = React.useState(false);
  const [titleEdited, setTitleEdited] = React.useState(false);
  const templates = useSurveyTemplates(system, open && canManage && mode === 'builtin');
  const sources = useSurveyCopySources(system, search, open && canManage && mode === 'existing');
  const source = useSurveyCopySource(
    sourceId,
    open && canManage && mode === 'existing' && !blocked,
  );
  const templateItems = !blocked && !templates.isFetching ? (templates.data?.items ?? []) : [];
  const sourceItems =
    !blocked && (!sources.isFetching || sources.isFetchingNextPage)
      ? (sources.data?.pages.flatMap((page) => page.items) ?? [])
      : [];
  const template = templates.data?.items.find((item) => item.template_id === templateId);
  const systems = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    enabled: open,
    retry: false,
  });
  const scope = useQuery({
    queryKey: ['permission-scope', 'survey.manage'],
    queryFn: ({ signal }) => fetchCapabilityScope('survey.manage', { signal }),
    enabled: open,
    retry: false,
  });
  const analyticsAreas = useQuery({
    queryKey: ['analytics-areas', { managedSystemId: system, includeArchived: false }],
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({ managedSystemId: system, includeArchived: false, signal }),
    enabled: open && Boolean(system),
    retry: false,
  });
  const allowedSystems = (systems.data?.items ?? []).filter(
    (candidate) =>
      candidate.archived_at === null &&
      (scope.data?.scope.kind === 'all' ||
        (scope.data?.scope.kind === 'scoped' &&
          scope.data.scope.managed_system_ids.includes(candidate.id))),
  );
  const systemInScope = allowedSystems.some((candidate) => candidate.id === system);
  const definition =
    canManage && !blocked && systemInScope
      ? mode === 'builtin' && !templates.isFetching && !templates.isError
        ? template
        : mode === 'existing' && !source.isFetching && !source.isError
          ? source.data
          : undefined
      : undefined;
  const clearSelection = React.useCallback(() => {
    setTemplateId('');
    setSourceId('');
    setBlocked(false);
    pinnedStart.current = null;
  }, []);
  React.useEffect(() => {
    // While an attempt is pinned (uncertain outcome) a background refetch must
    // not alter what the next unchanged retry sends (ADR-0070: one explicit key
    // for an unchanged pending/uncertain attempt).
    if (definition && !pinnedStart.current) {
      setType(definition.type);
      if (!titleEdited) setTitle(definition.title);
    }
  }, [definition, titleEdited]);
  React.useEffect(() => {
    if (!canManage) {
      clearSelection();
      setSearch('');
    }
  }, [canManage, clearSelection]);
  const sourceReadDenied =
    (sources.error instanceof ApiError &&
      (sources.error.status === 403 || sources.error.status === 404)) ||
    (source.error instanceof ApiError &&
      (source.error.status === 403 || source.error.status === 404));
  React.useEffect(() => {
    if (!sourceReadDenied) return;
    setBlocked(true);
    setTemplateId('');
    setSourceId('');
    pinnedStart.current = null;
  }, [sourceReadDenied]);
  React.useEffect(() => {
    // Selected Managed System leaving the manageable scope latches like a read
    // denial: source data and submission block until explicit 새로고침 or
    // reselection; an automatic scope refresh restores neither (ADR-0070).
    if (!system || systemInScope) return;
    setBlocked(true);
    setTemplateId('');
    setSourceId('');
    pinnedStart.current = null;
  }, [system, systemInScope]);
  const resetCreate = create.reset;
  const reset = React.useCallback(() => {
    setTitle('');
    setType('');
    setSystem('');
    setDescription('');
    setAnalyticsArea('');
    setIdentityProtected('');
    setMode('blank');
    setSearch('');
    clearSelection();
    setTitleEdited(false);
    resetCreate();
  }, [resetCreate, clearSelection]);
  const close = () => {
    if (submitting.current || create.isPending) return;
    reset();
    onClose();
  };
  React.useEffect(() => {
    if (!open && !create.isPending && !submitting.current) reset();
  }, [open, create.isPending, reset]);
  return (
    <Dialog
      open={(open && canManage) || create.isPending}
      onOpenChange={(next) => !next && close()}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={() => {
          if (document.activeElement instanceof HTMLElement)
            opener.current = document.activeElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (submitting.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (submitting.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Survey 생성</DialogTitle>
          <DialogDescription>{COPY.mode}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              submitting.current ||
              !canManage ||
              !title.trim() ||
              !type ||
              !system ||
              !systemInScope ||
              identityProtected === '' ||
              (mode !== 'blank' && (!definition || blocked))
            )
              return;
            const startingPoint: SurveyStartingPoint | undefined =
              pinnedStart.current ??
              (mode === 'builtin' && template
                ? { kind: 'builtin', template_id: template.template_id, version: template.version }
                : mode === 'existing' && source.data
                  ? {
                      kind: 'existing_survey',
                      survey_id: source.data.survey_id,
                      definition_token: source.data.definition_token,
                    }
                  : undefined);
            // An unchanged retry replays the submitted token even if a background
            // snapshot refetch installed a changed one (ADR-0070: one explicit key
            // for an unchanged pending/uncertain attempt).
            pinnedStart.current = startingPoint ?? null;
            submitting.current = true;
            try {
              const created = await create.mutateAsync({
                type,
                title: title.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                primary_managed_system_id: system,
                ...(analyticsArea ? { analytics_area_id: analyticsArea } : {}),
                responses_identity_protected: identityProtected === 'true',
                ...(startingPoint ? { starting_point: startingPoint } : {}),
              });
              reset();
              onCreated(created.id);
            } catch (error) {
              if (
                startingPoint &&
                error instanceof ApiError &&
                (error.status === 403 ||
                  error.status === 404 ||
                  error.code === 'conflict.stale_write')
              ) {
                setBlocked(true);
                setTemplateId('');
                setSourceId('');
                pinnedStart.current = null;
              }
            } finally {
              submitting.current = false;
            }
          }}
        >
          {!canManage ? (
            <output>{COPY.pending}</output>
          ) : (
            <fieldset disabled={create.isPending} className="flex flex-col gap-4">
              <div>
                {COPY.mode}
                <Select
                  value={mode}
                  onValueChange={(value) => {
                    setMode(value as typeof mode);
                    clearSelection();
                    setSearch('');
                  }}
                >
                  <SelectTrigger aria-label={COPY.mode}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">{COPY.blank}</SelectItem>
                    <SelectItem value="builtin">{COPY.builtin}</SelectItem>
                    <SelectItem value="existing">{COPY.existing}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="block text-sm" htmlFor="survey-title">
                제목
                <Input
                  id="survey-title"
                  aria-label="제목"
                  value={title}
                  onChange={(event) => {
                    setTitleEdited(true);
                    setTitle(event.target.value);
                  }}
                  required
                />
              </label>
              <div className="block text-sm">
                Survey 유형
                <Select
                  value={type}
                  onValueChange={(value) => {
                    setType(value as SurveyType);
                    clearSelection();
                  }}
                >
                  <SelectTrigger aria-label="Survey 유형">
                    <SelectValue placeholder="유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {surveyTypeSchema.options.map((type) => (
                      <SelectItem key={type} value={type}>
                        {SURVEY_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="block text-sm">
                Managed System
                <Select
                  value={system}
                  onValueChange={(value) => {
                    setSystem(value);
                    setAnalyticsArea('');
                    clearSelection();
                    setSearch('');
                  }}
                >
                  <SelectTrigger aria-label="Managed System">
                    <SelectValue placeholder="Managed System 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedSystems.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode !== 'blank' && (
                <section aria-label={COPY.preview} className="flex flex-col gap-2">
                  {!system ? (
                    <p>{COPY.chooseSystem}</p>
                  ) : !systemInScope ? (
                    <p role="alert">{COPY.reselect}</p>
                  ) : (
                    <>
                      {mode === 'existing' && (
                        <Input
                          aria-label={COPY.search}
                          value={search}
                          maxLength={200}
                          onChange={(event) => {
                            setSearch(event.target.value);
                            clearSelection();
                          }}
                        />
                      )}
                      {(mode === 'builtin'
                        ? templates.isFetching
                        : sources.isFetching && !sources.isFetchingNextPage) && (
                        <output>{COPY.loading}</output>
                      )}
                      {(mode === 'builtin' ? templates.isError : sources.isError) ? (
                        <p role="alert">{COPY.loadFailed}</p>
                      ) : (
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          orientation="vertical"
                          className="flex-col items-stretch"
                          aria-label={mode === 'builtin' ? COPY.builtin : COPY.existing}
                          value={mode === 'builtin' ? templateId : sourceId}
                          onValueChange={(value) => {
                            clearSelection();
                            if (mode === 'builtin') setTemplateId(value);
                            else setSourceId(value);
                          }}
                        >
                          {mode === 'builtin'
                            ? templateItems.map((item) => (
                                <ToggleGroupItem key={item.template_id} value={item.template_id}>
                                  {item.title} · {SURVEY_TYPE_LABELS[item.type]} ·{' '}
                                  {COPY.questions(item.questions.length)}
                                </ToggleGroupItem>
                              ))
                            : sourceItems.map((item) => (
                                <ToggleGroupItem key={item.survey_id} value={item.survey_id}>
                                  {item.display_id} · {item.title} ·{' '}
                                  {SURVEY_STATUS_LABELS[item.status]} ·{' '}
                                  {COPY.questions(item.question_count)}
                                </ToggleGroupItem>
                              ))}
                        </ToggleGroup>
                      )}
                      {mode === 'existing' &&
                        sources.isSuccess &&
                        !sources.isFetching &&
                        !blocked &&
                        !sources.hasNextPage &&
                        sources.data.pages.every((page) => page.items.length === 0) && (
                          <p>{COPY.empty}</p>
                        )}
                      {mode === 'existing' && sources.hasNextPage && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={sources.isFetchingNextPage}
                          onClick={() => void sources.fetchNextPage()}
                        >
                          {COPY.more}
                        </Button>
                      )}
                      {mode === 'existing' && sourceId && source.isFetching && (
                        <output>{COPY.loading}</output>
                      )}
                      {mode === 'existing' && sourceId && source.isError && (
                        <p role="alert">{COPY.previewFailed}</p>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          clearSelection();
                          if (mode === 'builtin') void templates.refetch();
                          else void sources.refetch();
                        }}
                      >
                        {COPY.retry}
                      </Button>
                      {template && definition && <p className="text-sm">{template.description}</p>}
                      {definition && (
                        <ol className="flex max-h-40 flex-col gap-2 overflow-y-auto text-sm">
                          {definition.questions.map((question, index) => (
                            <li key={'key' in question ? question.key : question.id}>
                              <p>
                                {index + 1}. {question.prompt} ·{' '}
                                {question.is_required ? COPY.required : COPY.optional}
                              </p>
                              {'options' in question && question.options && (
                                <p>{question.options.map((option) => option.label).join(' / ')}</p>
                              )}
                              {question.kind === 'rating' && (
                                <p>
                                  {question.rating_min}–{question.rating_max} ·{' '}
                                  {question.rating_low_label} / {question.rating_high_label}
                                </p>
                              )}
                              {'branch_parent_question_id' in question &&
                                question.branch_parent_question_id && (
                                  <p>
                                    {COPY.branch(
                                      definition.questions.find(
                                        (parent) =>
                                          'id' in parent &&
                                          parent.id === question.branch_parent_question_id,
                                      )?.prompt ?? '',
                                      definition.questions
                                        .find(
                                          (parent): parent is SurveyCopySourceQuestion =>
                                            'id' in parent &&
                                            parent.id === question.branch_parent_question_id,
                                        )
                                        ?.options?.find(
                                          (option) =>
                                            option.key === question.branch_trigger_option_key,
                                        )?.label ?? '',
                                    )}
                                  </p>
                                )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  )}
                </section>
              )}
              <label className="block text-sm" htmlFor="survey-description">
                설명 (선택)
                <Textarea
                  id="survey-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="block text-sm">
                Analytics Area (선택)
                <Select value={analyticsArea} onValueChange={setAnalyticsArea} disabled={!system}>
                  <SelectTrigger aria-label="Analytics Area">
                    <SelectValue placeholder="선택 안 함" />
                  </SelectTrigger>
                  <SelectContent>
                    {(analyticsAreas.data?.items ?? []).map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="block text-sm">
                응답 익명 보호
                <Select
                  value={identityProtected}
                  onValueChange={(value) => setIdentityProtected(value as 'true' | 'false')}
                >
                  <SelectTrigger aria-label="응답 익명 보호">
                    <SelectValue placeholder="보호 여부 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">보호함</SelectItem>
                    <SelectItem value="false">보호하지 않음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>
          )}
          {blocked && !(mode !== 'blank' && Boolean(system) && !systemInScope) && (
            <p role="alert">{COPY.reselect}</p>
          )}
          {create.isError && (
            <p role="alert" className="text-sm text-text-danger">
              {COPY.createFailed}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              disabled={create.isPending}
              data-testid="survey-create-cancel"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !canManage ||
                !title.trim() ||
                !type ||
                !system ||
                !systemInScope ||
                identityProtected === '' ||
                (mode !== 'blank' && (!definition || blocked))
              }
              data-testid="survey-create-submit"
            >
              초안 만들기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
