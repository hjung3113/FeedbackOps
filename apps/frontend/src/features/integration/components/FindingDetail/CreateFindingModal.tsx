// CreateFindingModal — small modal form for creating a Finding from a VOC.
// Fields: title, summary, severity. Mirrors EditDescriptionModal pattern.
// On success: navigates to /findings/:newId.

import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import {
  type CreateFindingRequest,
  type FindingSeverity,
  createFindingRequestSchema,
} from '@fops/shared';
import {
  AnalyticsAreaPicker,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useCreateFindingFromVocMutation } from '../../hooks/useCreateFindingFromVocMutation';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CreateFindingModalProps {
  vocId: string;
  managedSystemId: string;
  sourceAnalyticsAreaId: string | null;
  open: boolean;
  onClose: () => void;
}

// ── Severity options ──────────────────────────────────────────────────────────

const SEVERITY_OPTIONS: { value: FindingSeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateFindingModal({
  vocId,
  managedSystemId,
  sourceAnalyticsAreaId,
  open,
  onClose,
}: CreateFindingModalProps): React.ReactElement {
  const navigate = useNavigate();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const mutation = useCreateFindingFromVocMutation({ idempotencyKey });

  const form = useForm<CreateFindingRequest>({
    resolver: zodResolver(createFindingRequestSchema),
    defaultValues: {
      title: '',
      summary: '',
      severity: 'medium',
      analytics_area_id: sourceAnalyticsAreaId ?? undefined,
    },
    mode: 'onBlur',
  });

  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', managedSystemId] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({ managedSystemId, includeArchived: true, signal }),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  const analyticsAreaOptions = React.useMemo(
    () =>
      (analyticsAreasQuery.data?.items ?? [])
        .filter(
          (area) =>
            area.managed_system_id === managedSystemId &&
            (area.archived_at === null || area.id === sourceAnalyticsAreaId),
        )
        .map((area) => ({
          id: area.id,
          label: area.archived_at === null ? area.name : `${area.name} (보관됨)`,
          archived: area.archived_at !== null,
        })),
    [analyticsAreasQuery.data?.items, managedSystemId, sourceAnalyticsAreaId],
  );

  function closeAndReset(): void {
    form.reset();
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: CreateFindingRequest): void {
    mutation.mutate(
      { vocId, body: values },
      {
        onSuccess: (finding) => {
          markConsumed();
          form.reset();
          mutation.reset();
          onClose();
          void navigate({ to: '/findings/$findingId', params: { findingId: finding.id } });
        },
        onError: (err: ApiError) => {
          toast.error(errorMapper(err.envelope).message);
        },
      },
    );
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finding 생성</DialogTitle>
        </DialogHeader>

        <form
          id="create-finding-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="finding-title">
              제목
            </FieldLabel>
            <Input
              id="finding-title"
              placeholder="Finding을 한 줄로 요약하세요."
              {...form.register('title')}
              aria-invalid={Boolean(form.formState.errors.title)}
            />
            {form.formState.errors.title?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="finding-summary">
              요약
            </FieldLabel>
            <Textarea
              id="finding-summary"
              placeholder="어떤 문제가 있고 왜 실행해야 하는지 설명하세요."
              rows={4}
              {...form.register('summary')}
              aria-invalid={Boolean(form.formState.errors.summary)}
            />
            {form.formState.errors.summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.summary.message}
              </p>
            )}
          </div>

          {/* Severity */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="finding-severity">
              심각도
            </FieldLabel>
            <Select
              defaultValue="medium"
              onValueChange={(val) =>
                form.setValue('severity', val as FindingSeverity, { shouldValidate: true })
              }
            >
              <SelectTrigger id="finding-severity">
                <SelectValue placeholder="심각도 선택" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.severity?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.severity.message}
              </p>
            )}
          </div>

          {/* Analytics Area */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Analytics Area (선택)</FieldLabel>
            {analyticsAreasQuery.isLoading ? (
              <p className="text-xs text-text-muted">Analytics Area를 불러오는 중입니다.</p>
            ) : analyticsAreasQuery.isError ? (
              <p className="text-xs text-feedback-error">Analytics Area를 불러오지 못했습니다.</p>
            ) : analyticsAreaOptions.length === 0 ? (
              <p className="text-xs text-text-muted">
                이 Managed System에 선택할 수 있는 Analytics Area가 없습니다.
              </p>
            ) : (
              <Controller
                control={form.control}
                name="analytics_area_id"
                render={({ field }) => (
                  <AnalyticsAreaPicker
                    options={analyticsAreaOptions}
                    value={field.value ?? null}
                    onChange={(id) => field.onChange(id ?? undefined)}
                    placeholder="Analytics Area 선택"
                    testId="create-finding-aa-picker"
                  />
                )}
              />
            )}
            <p className="text-xs text-text-muted">
              소스 VOC의 Analytics Area를 승계하며 생성 전에 변경할 수 있습니다.
            </p>
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="submit" form="create-finding-form" disabled={isSubmitting}>
            Finding 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
