import { ApiError, apiRequest } from '@/lib/api';
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

interface VocSourcePickerProps {
  managedSystemId: string;
  value: string | null;
  onChange: (vocId: string) => void;
  id: string;
  invalid: boolean;
  describedBy?: string;
}

// #821: keystrokes settle for this long before the debounced text goes to the
// server as `q` on GET /vocs. Server `q` covers display IDs by prefix and
// titles by substring within the same scope, so the old /nav/resolve
// exact-ID path is gone.
const SEARCH_DEBOUNCE_MS = 300;

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

  // #821: server results are rendered as returned — the request is already
  // scoped by managed_system_id and searched by q, so no client-side filter.
  const options = useMemo(
    () =>
      (vocsQuery.data?.items ?? []).map((voc) => ({
        value: voc.id,
        label: `${voc.display_id} · ${voc.title}`,
      })),
    [vocsQuery.data],
  );

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
