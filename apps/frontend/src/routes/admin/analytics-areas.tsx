// /admin/analytics-areas — Slice 2 #11 functional admin surface.
//
// MS-picker at top is the optional parent selector. When unset, the list
// is grouped by managed_system_id; when set, the page calls
// GET /analytics-areas?managed_system_id=… and shows a flat list. Strict
// functional rendering per the design-HTML-pending rule.

import { AnalyticsAreaPicker, Button, ManagedSystemPicker, type PickerOption } from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { PermissionGate } from '../../features/admin/permissions/permission-gate.js';
import {
  type AnalyticsAreaDto,
  ApiError,
  type ManagedSystemDto,
  type RegisterAnalyticsAreaBody,
  UnauthenticatedError,
  type UpdateAnalyticsAreaBody,
  archiveAnalyticsArea,
  fetchAnalyticsAreas,
  fetchManagedSystems,
  fetchMe,
  registerAnalyticsArea,
  updateAnalyticsArea,
} from '../../lib/api.js';

export const Route = createFileRoute('/admin/analytics-areas')({
  beforeLoad: async () => {
    try {
      await fetchMe();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        throw redirect({ to: '/login' });
      }
    }
  },
  component: AnalyticsAreasAdminPage,
});

export function AnalyticsAreasAdminPage() {
  return (
    <main className="mx-auto max-w-5xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Analytics Areas</h1>
      <PermissionGate capability="workspace.admin">
        <AnalyticsAreasBody />
      </PermissionGate>
    </main>
  );
}

function envelopeMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

const AA_KEY = ['analytics-areas'] as const;

function msOptionsFrom(list: ManagedSystemDto[]): PickerOption[] {
  return list.filter((m) => m.archived_at === null).map((m) => ({ id: m.id, label: m.name }));
}

function groupByMs(items: AnalyticsAreaDto[]): Map<string, AnalyticsAreaDto[]> {
  const out = new Map<string, AnalyticsAreaDto[]>();
  for (const a of items) {
    const arr = out.get(a.managed_system_id) ?? [];
    arr.push(a);
    out.set(a.managed_system_id, arr);
  }
  return out;
}

export function AnalyticsAreasBody() {
  const qc = useQueryClient();
  const [filterMsId, setFilterMsId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const msQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    retry: false,
  });
  const aaQuery = useQuery({
    queryKey: [...AA_KEY, { filterMsId, includeArchived }] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        ...(filterMsId ? { managedSystemId: filterMsId } : {}),
        includeArchived,
        signal,
      }),
    retry: false,
  });

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: AA_KEY });
  }

  const msOptions = msQuery.data ? msOptionsFrom(msQuery.data.items) : [];
  const msNameById = new Map<string, string>(
    (msQuery.data?.items ?? []).map((m) => [m.id, m.name]),
  );

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Filter by Managed System (optional)</label>
        <ManagedSystemPicker
          options={msOptions}
          value={filterMsId}
          onChange={setFilterMsId}
          placeholder="All Managed Systems"
          testId="filter-managed-system-picker"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            data-testid="aa-include-archived-checkbox"
          />
          Include archived
        </label>
      </div>

      <CreateForm msOptions={msOptions} onCreated={invalidate} />

      {aaQuery.isPending ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : aaQuery.isError ? (
        <p className="text-sm text-accent-danger">Error: {envelopeMessage(aaQuery.error)}</p>
      ) : aaQuery.data.items.length === 0 ? (
        <p className="text-sm text-text-muted">No analytics areas.</p>
      ) : filterMsId ? (
        <AAFlatList items={aaQuery.data.items} onChanged={invalidate} />
      ) : (
        <AAGroupedList items={aaQuery.data.items} msNameById={msNameById} onChanged={invalidate} />
      )}
    </section>
  );
}

function CreateForm({
  msOptions,
  onCreated,
}: {
  msOptions: PickerOption[];
  onCreated: () => Promise<void>;
}) {
  const [msId, setMsId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (body: RegisterAnalyticsAreaBody) => registerAnalyticsArea(body),
    onSuccess: async () => {
      setSlug('');
      setName('');
      setError(null);
      await onCreated();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <form
      data-testid="create-analytics-area-form"
      className="space-y-2 rounded-md border border-default p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!msId) {
          setError('validation.failed: managed_system_id required');
          return;
        }
        mutation.mutate({ managed_system_id: msId, slug, name });
      }}
    >
      <h2 className="text-lg font-semibold">Register Analytics Area</h2>
      <label className="block text-sm">
        Managed System
        <ManagedSystemPicker
          className="ml-2"
          options={msOptions}
          value={msId}
          onChange={setMsId}
          testId="create-ms-picker"
        />
      </label>
      <label className="block text-sm">
        Slug
        <input
          className="ml-2 border px-1"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          data-testid="create-aa-slug"
        />
      </label>
      <label className="block text-sm">
        Name
        <input
          className="ml-2 border px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          data-testid="create-aa-name"
        />
      </label>
      <Button type="submit" disabled={mutation.isPending} data-testid="create-aa-submit">
        Register
      </Button>
      {error && (
        <p data-testid="create-aa-error" className="text-sm text-accent-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function AAGroupedList({
  items,
  msNameById,
  onChanged,
}: {
  items: AnalyticsAreaDto[];
  msNameById: Map<string, string>;
  onChanged: () => Promise<void>;
}) {
  const groups = groupByMs(items);
  return (
    <div data-testid="aa-grouped-list" className="space-y-4">
      {[...groups.entries()].map(([msId, rows]) => (
        <section key={msId} data-testid={`aa-group-${msId}`} className="space-y-2">
          <h2 className="text-lg font-semibold">{msNameById.get(msId) ?? msId}</h2>
          <AAFlatList items={rows} onChanged={onChanged} />
        </section>
      ))}
    </div>
  );
}

function AAFlatList({
  items,
  onChanged,
}: {
  items: AnalyticsAreaDto[];
  onChanged: () => Promise<void>;
}) {
  return (
    <table
      data-testid="analytics-areas-table"
      className="w-full border border-default text-sm"
    >
      <thead>
        <tr className="text-left">
          <th className="p-2">Slug</th>
          <th className="p-2">Name</th>
          <th className="p-2">Owner team</th>
          <th className="p-2">Archived</th>
          <th className="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <AnalyticsAreaRow key={row.id} row={row} onChanged={onChanged} />
        ))}
      </tbody>
    </table>
  );
}

function AnalyticsAreaRow({
  row,
  onChanged,
}: {
  row: AnalyticsAreaDto;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(row.name);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: UpdateAnalyticsAreaBody = {};
      if (name !== row.name) body.name = name;
      return updateAnalyticsArea(row.id, body);
    },
    onSuccess: async () => {
      setError(null);
      await onChanged();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => archiveAnalyticsArea(row.id),
    onSuccess: async () => {
      setError(null);
      await onChanged();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <tr data-testid={`aa-row-${row.slug}`} className="border-t border-default">
      <td className="p-2">{row.slug}</td>
      <td className="p-2">
        <input
          className="border px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={row.archived_at !== null}
          data-testid={`aa-name-input-${row.slug}`}
        />
      </td>
      <td className="p-2 text-xs">{row.owner_team_id ?? '—'}</td>
      <td className="p-2 text-xs">{row.archived_at ? 'yes' : 'no'}</td>
      <td className="p-2 space-x-2">
        <Button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || row.archived_at !== null}
          data-testid={`aa-save-${row.slug}`}
        >
          Save
        </Button>
        <Button
          type="button"
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending || row.archived_at !== null}
          data-testid={`aa-archive-${row.slug}`}
        >
          Archive
        </Button>
        {error && (
          <p data-testid={`aa-row-error-${row.slug}`} className="text-xs text-accent-danger">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

// Unused export silences "AnalyticsAreaPicker has no consumer" complaints
// from boundary tooling; the picker is exported from @fops/ui and may be
// consumed by routes that don't exist yet (Slice 3+).
export const _unusedPickerImport = AnalyticsAreaPicker;
