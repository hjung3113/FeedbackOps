import { ApiError, apiRequest, fetchNavResolve } from '@/lib/api';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { VOC_SOURCE_PICKER_COPY } from '@/lib/copy/voc';
import { vocListItemSchema } from '@fops/shared';
import { Combobox, type ComboboxOption } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

const vocSourceListResponseSchema = z.object({
  items: z.array(vocListItemSchema),
  page: z.object({
    cursor: z.string().optional(),
    has_more: z.boolean(),
  }),
});
const resolvedVocScopeSchema = vocListItemSchema.pick({
  id: true,
  display_id: true,
  title: true,
  primary_managed_system_id: true,
});

interface VocSourcePickerProps {
  managedSystemId: string;
  value: string | null;
  onChange: (vocId: string) => void;
  id: string;
  invalid: boolean;
  describedBy?: string;
}

export function VocSourcePicker({
  managedSystemId,
  value,
  onChange,
  id,
  invalid,
  describedBy,
}: VocSourcePickerProps): ReactElement {
  const [search, setSearch] = useState('');
  const [debouncedDisplayId, setDebouncedDisplayId] = useState<string | null>(null);
  const [resolvedOptions, setResolvedOptions] = useState<Record<string, ComboboxOption>>({});
  const vocsQuery = useQuery({
    queryKey: ['findings', 'voc-source-picker', managedSystemId],
    enabled: managedSystemId.length > 0,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({
        view: 'inbox',
        managed_system_id: managedSystemId,
        limit: '100',
      });
      const response = await apiRequest(
        'GET',
        `/vocs?${query.toString()}`,
        vocSourceListResponseSchema,
        { signal },
      );
      return response.data;
    },
    retry: false,
    staleTime: 30_000,
  });

  const candidateVocs = useMemo(
    () =>
      vocsQuery.data?.items.filter((voc) => voc.primary_managed_system_id === managedSystemId) ??
      [],
    [managedSystemId, vocsQuery.data],
  );
  const normalizedSearch = search.trim().toUpperCase();
  const displayId = /^VOC-[1-9][0-9]*$/.test(normalizedSearch) ? normalizedSearch : null;
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedDisplayId(displayId), 300);
    return () => window.clearTimeout(timeoutId);
  }, [displayId]);
  const alreadyLoaded =
    displayId !== null && candidateVocs.some((voc) => voc.display_id.toUpperCase() === displayId);
  const resolveQuery = useQuery({
    queryKey: ['nav', 'resolve-voc-source', managedSystemId, debouncedDisplayId],
    enabled: displayId !== null && debouncedDisplayId === displayId && !alreadyLoaded,
    queryFn: async ({ signal }) => {
      if (debouncedDisplayId === null) throw new Error('VOC display ID is missing');
      const resolved = await fetchNavResolve(debouncedDisplayId, { signal });
      if (resolved.entity_type !== 'voc') return null;

      const detail = await apiRequest('GET', `/vocs/${resolved.id}`, resolvedVocScopeSchema, {
        signal,
      });
      if (detail.data.primary_managed_system_id !== managedSystemId) return null;
      return {
        value: detail.data.id,
        label: `${detail.data.display_id} · ${detail.data.title}`,
      };
    },
    retry: false,
  });

  useEffect(() => {
    const resolved = resolveQuery.data;
    if (resolved === undefined || resolved === null) return;

    setResolvedOptions((current) => {
      if (current[resolved.value]?.label === resolved.label) return current;
      return {
        ...current,
        [resolved.value]: resolved,
      };
    });
  }, [resolveQuery.data]);

  const options = useMemo(() => {
    const byId = new Map<string, ComboboxOption>();
    for (const voc of candidateVocs) {
      byId.set(voc.id, { value: voc.id, label: `${voc.display_id} · ${voc.title}` });
    }
    for (const option of Object.values(resolvedOptions)) {
      const optionDisplayId = option.label.split(' · ', 1)[0]?.toUpperCase();
      if (option.value !== value && optionDisplayId !== normalizedSearch) continue;
      if (!byId.has(option.value)) byId.set(option.value, option);
    }
    return [...byId.values()];
  }, [candidateVocs, normalizedSearch, resolvedOptions, value]);

  const lookupUnavailable =
    displayId !== null &&
    debouncedDisplayId === displayId &&
    (resolveQuery.isError || resolveQuery.data === null);
  const lookupIsFetching =
    displayId !== null && debouncedDisplayId === displayId && resolveQuery.isFetching;
  const hasPermissionListError =
    vocsQuery.error instanceof ApiError && vocsQuery.error.envelope.code.startsWith('permission.');
  const listErrorText = hasPermissionListError
    ? PERMISSION_BLOCKED_REASONS.vocInboxManagedSystem
    : VOC_SOURCE_PICKER_COPY.error;

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        id={id}
        aria-invalid={invalid}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        options={options}
        value={value}
        onChange={onChange}
        onSearchChange={setSearch}
        placeholder={VOC_SOURCE_PICKER_COPY.placeholder}
        searchPlaceholder={VOC_SOURCE_PICKER_COPY.searchPlaceholder}
        listboxLabel={VOC_SOURCE_PICKER_COPY.listboxLabel}
        emptyText={
          vocsQuery.isLoading
            ? VOC_SOURCE_PICKER_COPY.loading
            : vocsQuery.isError
              ? listErrorText
              : lookupIsFetching
                ? VOC_SOURCE_PICKER_COPY.resolving
                : lookupUnavailable
                  ? VOC_SOURCE_PICKER_COPY.unavailable
                  : VOC_SOURCE_PICKER_COPY.emptyText
        }
        {...(vocsQuery.data?.page.has_more ? { footerText: VOC_SOURCE_PICKER_COPY.limitHint } : {})}
      />
      {vocsQuery.isLoading && (
        <output className="text-xs text-text-muted">{VOC_SOURCE_PICKER_COPY.loading}</output>
      )}
      {vocsQuery.isError && (
        <p className="text-xs text-text-danger" role="alert">
          {listErrorText}
        </p>
      )}
      {vocsQuery.isSuccess && options.length === 0 && displayId === null && (
        <output className="text-xs text-text-muted">{VOC_SOURCE_PICKER_COPY.empty}</output>
      )}
      {lookupIsFetching && (
        <output className="text-xs text-text-muted">{VOC_SOURCE_PICKER_COPY.resolving}</output>
      )}
      {lookupUnavailable && (
        <p className="text-xs text-text-danger" role="alert">
          {VOC_SOURCE_PICKER_COPY.unavailable}
        </p>
      )}
    </div>
  );
}

VocSourcePicker.displayName = 'VocSourcePicker';
