import { ApiError, apiRequest } from '@/lib/api';
import { fetchNavResolve } from '@/lib/api/nav';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { VOC_SOURCE_PICKER_COPY } from '@/lib/copy/voc';
import { vocListItemSchema } from '@fops/shared';
import { Combobox } from '@fops/ui';
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

// #815 exact-display-ID supplement: the searched list exposes only the newest
// 100 prefix matches, so a short exact ID (VOC-1 among VOC-10…VOC-199) can be
// missing from page one and more typing cannot narrow it. The lookup reads
// only the fields the picker renders.
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

// #821: keystrokes settle for this long before the debounced text goes to the
// server as `q` on GET /vocs (display-ID prefix + title substring search).
// The #815 exact-display-ID lookup runs as a supplement on the same debounce.
const SEARCH_DEBOUNCE_MS = 300;

const EXACT_DISPLAY_ID_PATTERN = /^VOC-[1-9][0-9]*$/;

interface PickerOption {
  value: string;
  label: string;
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // #821 fix1: once the search resets, the newest-100 page no longer contains
  // a search-only selection, so remember the option the user picked, keyed by
  // its value, to keep the trigger label.
  const [selectedOption, setSelectedOption] = useState<PickerOption | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const vocsQuery = useQuery({
    queryKey: ['findings', 'voc-source-picker', managedSystemId, debouncedSearch],
    enabled: managedSystemId.length > 0,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({
        view: 'inbox',
        managed_system_id: managedSystemId,
        limit: '100',
      });
      if (debouncedSearch !== '') query.set('q', debouncedSearch);
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

  const normalizedSearch = debouncedSearch.toUpperCase();
  const displayId = EXACT_DISPLAY_ID_PATTERN.test(normalizedSearch) ? normalizedSearch : null;

  // #815 supplement: resolve the exact display ID after the same debounce. A
  // non-VOC entity, another Managed System, or any error adds nothing.
  const exactQuery = useQuery({
    queryKey: ['findings', 'voc-source-picker-exact', managedSystemId, displayId],
    enabled: displayId !== null && managedSystemId.length > 0,
    queryFn: async ({ signal }): Promise<PickerOption | null> => {
      if (displayId === null) return null;
      const resolved = await fetchNavResolve(displayId, { signal });
      if (resolved.entity_type !== 'voc') return null;
      const detail = await apiRequest('GET', `/vocs/${resolved.id}`, resolvedVocScopeSchema, {
        signal,
      });
      if (detail.data.primary_managed_system_id !== managedSystemId) return null;
      return { value: detail.data.id, label: `${detail.data.display_id} · ${detail.data.title}` };
    },
    retry: false,
    staleTime: 30_000,
  });

  // Server results are rendered as returned — the request is already scoped by
  // managed_system_id and searched by q. The exact-ID lookup result is only
  // prepended when the searched page lacks that display_id.
  const options = useMemo((): PickerOption[] => {
    const items = vocsQuery.data?.items ?? [];
    const serverOptions = items.map((voc) => ({
      value: voc.id,
      label: `${voc.display_id} · ${voc.title}`,
    }));
    const exact = exactQuery.data;
    if (
      displayId !== null &&
      exact != null &&
      !items.some((voc) => voc.display_id.toUpperCase() === displayId)
    ) {
      return [exact, ...serverOptions];
    }
    return serverOptions;
  }, [vocsQuery.data, exactQuery.data, displayId]);

  // Keep the selected VOC's identity visible: when the current value is the
  // remembered selection and the server page no longer lists it, prepend it.
  const optionsWithSelected = useMemo((): PickerOption[] => {
    if (
      value !== null &&
      selectedOption !== null &&
      selectedOption.value === value &&
      !options.some((option) => option.value === value)
    ) {
      return [selectedOption, ...options];
    }
    return options;
  }, [options, selectedOption, value]);

  // Forget the remembered label when the value moves elsewhere or clears.
  useEffect(() => {
    if (value === null || (selectedOption !== null && selectedOption.value !== value)) {
      setSelectedOption(null);
    }
  }, [value, selectedOption]);

  const handleChange = (nextValue: string) => {
    const picked = options.find((option) => option.value === nextValue);
    if (picked !== undefined) setSelectedOption({ value: picked.value, label: picked.label });
    onChange(nextValue);
  };

  const hasSearch = debouncedSearch !== '';
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
        options={optionsWithSelected}
        value={value}
        onChange={handleChange}
        onSearchChange={setSearch}
        filterOptions={false}
        placeholder={VOC_SOURCE_PICKER_COPY.placeholder}
        searchPlaceholder={VOC_SOURCE_PICKER_COPY.searchPlaceholder}
        listboxLabel={VOC_SOURCE_PICKER_COPY.listboxLabel}
        emptyText={
          vocsQuery.isLoading
            ? VOC_SOURCE_PICKER_COPY.loading
            : vocsQuery.isError
              ? listErrorText
              : VOC_SOURCE_PICKER_COPY.emptyText
        }
        {...(vocsQuery.data?.page.has_more
          ? {
              footerText: hasSearch
                ? VOC_SOURCE_PICKER_COPY.searchLimitHint
                : VOC_SOURCE_PICKER_COPY.limitHint,
            }
          : {})}
      />
      {vocsQuery.isLoading && (
        <output className="text-xs text-text-muted">{VOC_SOURCE_PICKER_COPY.loading}</output>
      )}
      {vocsQuery.isError && (
        <p className="text-xs text-text-danger" role="alert">
          {listErrorText}
        </p>
      )}
      {vocsQuery.isSuccess && options.length === 0 && (
        <output className="text-xs text-text-muted">{VOC_SOURCE_PICKER_COPY.empty}</output>
      )}
    </div>
  );
}

VocSourcePicker.displayName = 'VocSourcePicker';
