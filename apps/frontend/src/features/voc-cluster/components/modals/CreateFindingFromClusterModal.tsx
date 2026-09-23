// Create a Finding from a VOC Cluster. Local form (not the cross-system
// CreateFindingModal): this flow is VOC-cluster origin and has its own
// analytics-free severity picker. No list invalidation on success — the
// success path navigates away to the new Finding.

import type { CreateFindingRequest, FindingSeverity } from '@fops/shared';
import { createFindingRequestSchema } from '@fops/shared';
import {
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
import { useNavigate } from '@tanstack/react-router';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useCreateFindingFromCluster } from '@/features/voc-cluster/hooks/useCreateFindingFromCluster';
import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';

// ── Severity options (mirrors CreateFindingModal) ─────────────────────────────

const SEVERITY_OPTIONS: { value: FindingSeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export function CreateFindingFromClusterModal({
  open,
  clusterId,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  onClose: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useCreateFindingFromCluster({ idempotencyKey });

  const form = useForm<CreateFindingRequest>({
    resolver: zodResolver(createFindingRequestSchema),
    defaultValues: {
      title: '',
      summary: '',
      severity: 'medium',
    },
    mode: 'onBlur',
  });

  function closeAndReset() {
    form.reset();
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: CreateFindingRequest) {
    mutation.mutate(
      { clusterId, body: values },
      {
        onSuccess: (finding) => {
          markConsumed();
          form.reset();
          mutation.reset();
          onClose();
          void navigate({
            to: '/findings/$findingId',
            params: { findingId: finding.id },
          });
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
      <DialogContent className="max-w-lg" data-testid="create-finding-from-cluster-modal">
        <DialogHeader>
          <DialogTitle>Finding 생성</DialogTitle>
        </DialogHeader>

        <form
          id="create-finding-from-cluster-form"
          data-testid="create-finding-from-cluster-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-title">
              제목
            </FieldLabel>
            <Input
              id="cluster-finding-title"
              placeholder="Finding을 한 줄로 요약하세요."
              {...form.register('title')}
              aria-invalid={Boolean(form.formState.errors.title)}
              data-testid="cluster-finding-title-input"
            />
            {form.formState.errors.title?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-summary">
              요약
            </FieldLabel>
            <Textarea
              id="cluster-finding-summary"
              placeholder="어떤 문제가 있고 왜 실행해야 하는지 설명하세요."
              rows={4}
              {...form.register('summary')}
              aria-invalid={Boolean(form.formState.errors.summary)}
              data-testid="cluster-finding-summary-input"
            />
            {form.formState.errors.summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.summary.message}
              </p>
            )}
          </div>

          {/* Severity */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-severity">
              심각도
            </FieldLabel>
            <Select
              defaultValue="medium"
              onValueChange={(val) =>
                form.setValue('severity', val as FindingSeverity, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger
                id="cluster-finding-severity"
                data-testid="cluster-finding-severity-select"
              >
                <SelectValue placeholder="심각도 선택" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    data-testid={`severity-option-${opt.value}`}
                  >
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
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={closeAndReset}
            disabled={isSubmitting}
            data-testid="create-finding-from-cluster-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="create-finding-from-cluster-form"
            disabled={isSubmitting}
            data-testid="create-finding-from-cluster-submit"
          >
            Finding 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
