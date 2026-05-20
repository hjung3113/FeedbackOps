// /admin/managed-systems — Slice 2 #10 functional admin surface.
//
// Strict functional rendering only per the orchestrator's design-HTML-
// pending rule: no visual polish, no shared MS picker component (that
// lands with the AA slice). The route wraps the body in PermissionGate
// (workspace.admin) and surfaces ADR-0012 error envelopes verbatim.

import { Button } from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
import {
  ApiError,
  type ManagedSystemDto,
  type RegisterManagedSystemBody,
  type UpdateManagedSystemBody,
  archiveManagedSystem,
  fetchManagedSystems,
  registerManagedSystem,
  updateManagedSystem,
} from '../../../lib/api';

export const Route = createFileRoute('/_authed/admin/managed-systems')({
  component: ManagedSystemsAdminPage,
});

export function ManagedSystemsAdminPage() {
  return (
    <main className="mx-auto max-w-5xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Managed Systems</h1>
      <PermissionGate capability="workspace.admin">
        <ManagedSystemsBody />
      </PermissionGate>
    </main>
  );
}

function envelopeMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

const MANAGED_SYSTEMS_KEY = ['managed-systems'] as const;

export function ManagedSystemsBody() {
  const qc = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const listQuery = useQuery({
    queryKey: [...MANAGED_SYSTEMS_KEY, { includeArchived }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived, signal }),
    retry: false,
  });

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: MANAGED_SYSTEMS_KEY });
  }

  return (
    <section className="space-y-6">
      <CreateForm onCreated={invalidate} />

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            data-testid="include-archived-checkbox"
          />
          Include archived
        </label>

        {listQuery.isPending ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-accent-danger">Error: {envelopeMessage(listQuery.error)}</p>
        ) : listQuery.data.items.length === 0 ? (
          <p className="text-sm text-text-muted">No managed systems.</p>
        ) : (
          <table
            data-testid="managed-systems-table"
            className="w-full border border-default text-sm"
          >
            <thead>
              <tr className="text-left">
                <th className="p-2">Slug</th>
                <th className="p-2">Name</th>
                <th className="p-2">External key</th>
                <th className="p-2">Owner actor</th>
                <th className="p-2">Owner team</th>
                <th className="p-2">Archived</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.items.map((row) => (
                <ManagedSystemRow key={row.id} row={row} onChanged={invalidate} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function CreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [externalKey, setExternalKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (body: RegisterManagedSystemBody) => registerManagedSystem(body),
    onSuccess: async () => {
      setSlug('');
      setName('');
      setExternalKey('');
      setError(null);
      await onCreated();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <form
      data-testid="create-managed-system-form"
      className="space-y-2 rounded-md border border-default p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const body: RegisterManagedSystemBody = { slug, name };
        if (externalKey.length > 0) body.external_key = externalKey;
        mutation.mutate(body);
      }}
    >
      <h2 className="text-lg font-semibold">Register</h2>
      <label className="block text-sm">
        Slug
        <input
          className="ml-2 border px-1"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          data-testid="create-slug"
        />
      </label>
      <label className="block text-sm">
        Name
        <input
          className="ml-2 border px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          data-testid="create-name"
        />
      </label>
      <label className="block text-sm">
        External key (optional)
        <input
          className="ml-2 border px-1"
          value={externalKey}
          onChange={(e) => setExternalKey(e.target.value)}
          data-testid="create-external-key"
        />
      </label>
      <Button type="submit" disabled={mutation.isPending} data-testid="create-submit">
        Register
      </Button>
      {error && (
        <p data-testid="create-error" className="text-sm text-accent-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function ManagedSystemRow({
  row,
  onChanged,
}: {
  row: ManagedSystemDto;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(row.name);
  const [externalKey, setExternalKey] = useState(row.external_key ?? '');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: UpdateManagedSystemBody = {};
      if (name !== row.name) body.name = name;
      const nextKey = externalKey.length > 0 ? externalKey : null;
      if (nextKey !== row.external_key) body.external_key = nextKey;
      return updateManagedSystem(row.id, body);
    },
    onSuccess: async () => {
      setError(null);
      await onChanged();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => archiveManagedSystem(row.id),
    onSuccess: async () => {
      setError(null);
      await onChanged();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <tr data-testid={`managed-system-row-${row.slug}`} className="border-t border-default">
      <td className="p-2">{row.slug}</td>
      <td className="p-2">
        <input
          className="border px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={row.archived_at !== null}
          data-testid={`name-input-${row.slug}`}
        />
      </td>
      <td className="p-2">
        <input
          className="border px-1"
          value={externalKey}
          onChange={(e) => setExternalKey(e.target.value)}
          disabled={row.archived_at !== null}
          data-testid={`external-key-input-${row.slug}`}
        />
      </td>
      <td className="p-2 text-xs">{row.default_owner_actor_id ?? '—'}</td>
      <td className="p-2 text-xs">{row.default_owner_team_id ?? '—'}</td>
      <td className="p-2 text-xs">{row.archived_at ? 'yes' : 'no'}</td>
      <td className="p-2 space-x-2">
        <Button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || row.archived_at !== null}
          data-testid={`save-${row.slug}`}
        >
          Save
        </Button>
        <Button
          type="button"
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending || row.archived_at !== null}
          data-testid={`archive-${row.slug}`}
        >
          Archive
        </Button>
        {error && (
          <p data-testid={`row-error-${row.slug}`} className="text-xs text-accent-danger">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}
