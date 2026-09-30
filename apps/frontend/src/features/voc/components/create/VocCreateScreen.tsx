// VocCreateScreen — two-column form for VOC creation.
// C4+C5 of Slice 3 #19.
// Left column: react-hook-form wired fields. Right column: reporter info + disclaimer.

import type * as React from 'react';
import { Link } from '@tanstack/react-router';
import { Controller } from 'react-hook-form';

import {
  FieldLabel,
  ManagedSystemPicker,
  AnalyticsAreaPicker,
  Input,
  RichEditor,
  Skeleton,
  Button,
} from '@fops/ui';
import { mapUnknownError } from '@/lib/api';
import { SourceContextSegmented } from './SourceContextSegmented';
import { AttachmentDropzone } from './AttachmentDropzone';
import { ReporterCard } from './ReporterCard';
import { SimilarVocPanel } from './SimilarVocPanel';
import { SeverityDisclaimerCard } from './SeverityDisclaimerCard';
import { vocDescriptionToolbar } from './VocDescriptionToolbar';
import { uploadRichEditorAttachment } from '@/lib/attachments/rich-editor-upload';
import { useVocCreateController } from './useVocCreateController';

const SECTION_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-text-muted';

export interface VocCreateScreenProps {
  initialManagedSystemId?: string;
  onCancel: () => void;
  /** Called whenever isDirty state changes so the parent (CreateRoute) can drive useBlocker. */
  onDirtyChange?: (isDirty: boolean) => void;
}

export function VocCreateScreen({ initialManagedSystemId, onCancel, onDirtyChange }: VocCreateScreenProps): React.ReactElement {
  const {
    form,
    msQuery,
    selectedMs,
    aaQuery,
    msOptions,
    aaOptions,
    isSubmitting,
    attachmentsUploading,
    hasAttachmentErrors,
    setAttachmentIds,
    setAttachmentsUploading,
    setAttachmentErrorCount,
    handleSubmit,
    handleAttachmentError,
  } = useVocCreateController({
    ...(initialManagedSystemId !== undefined ? { initialManagedSystemId } : {}),
    ...(onDirtyChange !== undefined ? { onDirtyChange } : {}),
  });

  return (
    <div className="flex h-full flex-col">
      {/* Main two-column area */}
      <div className="flex-1 overflow-auto px-4 py-5 md:px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left column — single compact form card */}
          <form
            className="flex flex-col rounded-lg border border-border-subtle bg-surface-card p-5 shadow-sm lg:col-span-9"
            onSubmit={form.handleSubmit(handleSubmit)}
            noValidate
            id="voc-create-form"
          >
            {/* Title */}
            <div className="flex flex-col gap-2">
              <FieldLabel required htmlFor="title">제목</FieldLabel>
              <Input
                id="title"
                placeholder="겪으신 문제를 한 줄로 요약해 주세요"
                {...form.register('title')}
                aria-invalid={Boolean(form.formState.errors.title)}
              />
              {form.formState.errors.title?.message && (
                <p className="text-xs text-text-danger">{form.formState.errors.title.message}</p>
              )}
            </div>

            <FormDivider />

            {/* Description */}
            <div className="flex flex-col gap-2">
              <FieldLabel
                required
                htmlFor="description_rich_content"
                tip="겪으신 일을 시간 순서대로 적어주시면 도움이 됩니다"
              >
                상세 설명
              </FieldLabel>
              <Controller
                control={form.control}
                name="description_rich_content"
                render={({ field }) => (
                  <RichEditor
                    surface="voc-description"
                    value={field.value as import('@fops/ui').TipTapDoc}
                    onChange={(doc) => field.onChange(doc)}
                    placeholder="VOC 내용을 자세히 적어주세요"
                    minHeight={160}
                    toolbar={vocDescriptionToolbar({
                      onAttachError: handleAttachmentError,
                    })}
                    onAttach={uploadRichEditorAttachment}
                  />
                )}
              />
              {form.formState.errors.description_rich_content?.message && (
                <p className="text-xs text-text-danger">
                  {form.formState.errors.description_rich_content.message}
                </p>
              )}
            </div>

            <FormDivider />

            {/* Source Context */}
            <div className="flex flex-col gap-2">
              <FieldLabel
                className={SECTION_LABEL_CLASS}
                tip="기본은 Direct Use. 다른 팀원·고객사 경험을 대신 등록할 때는 Proxy Report."
              >
                출처
              </FieldLabel>
              <Controller
                control={form.control}
                name="source_context"
                render={({ field }) => (
                  <SourceContextSegmented
                    value={field.value}
                    onChange={field.onChange}
                    testId="source-context-segmented"
                  />
                )}
              />
              <p className="text-xs text-text-muted">타인 대신 보고는 다른 팀원이나 고객의 경험을 대신 등록하는 경우입니다.</p>
            </div>

            <FormDivider />

            {/* Managed System */}
            <div className="flex flex-col gap-2">
              <FieldLabel
                required
                htmlFor="primary_managed_system_id"
                className={SECTION_LABEL_CLASS}
                tip="제출 후 변경할 수 없습니다. 어느 시스템에 대한 VOC인지 정확히 골라주세요."
              >
                Managed System
              </FieldLabel>
              {msQuery.isLoading ? (
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ) : msQuery.isError ? (
                <p className="text-sm text-text-danger">
                  {mapUnknownError(msQuery.error).message}
                </p>
              ) : msOptions.length === 0 ? (
                <p className="text-sm text-text-muted">
                  등록된 Managed System이 없습니다.{' '}
                  <Link to="/admin/managed-systems" className="text-accent-primary underline">
                    관리 페이지에서 추가하세요
                  </Link>
                </p>
              ) : (
                <Controller
                  control={form.control}
                  name="primary_managed_system_id"
                  render={({ field }) => (
                    <ManagedSystemPicker
                      options={msOptions}
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? '')}
                      placeholder="Managed System 선택"
                      testId="ms-picker"
                    />
                  )}
                />
              )}
              {form.formState.errors.primary_managed_system_id?.message && (
                <p className="text-xs text-text-danger">
                  {form.formState.errors.primary_managed_system_id.message}
                </p>
              )}
            </div>

            {/* Analytics Area */}
            <div className="mt-4 flex flex-col gap-2">
              <FieldLabel
                htmlFor="analytics_area_id"
                className={SECTION_LABEL_CLASS}
                tip="선택사항. 선택한 Managed System 안의 분석 영역만 고를 수 있어요."
              >
                ANALYTICS AREA
              </FieldLabel>
              {selectedMs && aaQuery.isLoading ? (
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ) : (
                <Controller
                  control={form.control}
                  name="analytics_area_id"
                  render={({ field }) => (
                    <AnalyticsAreaPicker
                      options={aaOptions}
                      value={field.value ?? null}
                      onChange={(id) => field.onChange(id ?? undefined)}
                      disabled={!selectedMs}
                      placeholder="Analytics Area 선택"
                      testId="aa-picker"
                    />
                  )}
                />
              )}
              {form.formState.errors.analytics_area_id?.message && (
                <p className="text-xs text-text-danger">
                  {form.formState.errors.analytics_area_id.message}
                </p>
              )}
              <p className="text-xs text-text-muted">Analytics Area는 VOC를 분석할 때 함께 볼 주제에 맞춰 선택하세요.</p>
            </div>

            <FormDivider />

            {/* Attachments — active multi-file upload (C6). */}
            <AttachmentDropzone
              testId="attachment-dropzone"
              onChange={setAttachmentIds}
              onUploadingChange={setAttachmentsUploading}
              onErrorCountChange={setAttachmentErrorCount}
            />
          </form>

          {/* Right column */}
          <div className="flex flex-col gap-3 lg:col-span-3">
            <ReporterCard />
            <SimilarVocPanel managedSystemId={selectedMs} />
            <SeverityDisclaimerCard />
          </div>
        </div>
      </div>

      {/* PLAN-22 §Bug-3: inline submit-blocked alert. Visible above the action
          bar whenever any attachment row is in error state. Disable-by-itself
          would surface no explanation — the alert is the user-facing
          counterpart to the disabled button. Korean copy mirrors the
          prototype's tone. */}
      {hasAttachmentErrors && (
        <div
          role="alert"
          data-testid="attachment-submit-blocked-alert"
          className="sticky bottom-16 mx-4 mb-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-danger shadow-sm md:mx-6"
        >
          첨부 파일에 오류가 있어 제출할 수 없습니다. 빨간색으로 표시된 파일을 제거하거나 다른 파일로 교체해 주세요.
        </div>
      )}

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-border-subtle bg-surface-card px-4 py-3 shadow-sm md:px-6">
        <span className="hidden text-xs text-text-muted md:inline">
          제출 후 Managed System은 변경 불가
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="subtle"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          취소
        </Button>
        <Button
          type="submit"
          form="voc-create-form"
          disabled={
            !form.formState.isValid ||
            isSubmitting ||
            attachmentsUploading ||
            hasAttachmentErrors
          }
        >
          VOC 제출
        </Button>
      </div>
    </div>
  );
}

function FormDivider(): React.ReactElement {
  return <div className="my-4 h-px bg-border-subtle" aria-hidden />;
}
