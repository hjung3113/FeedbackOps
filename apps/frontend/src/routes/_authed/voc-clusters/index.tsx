// /voc-clusters — ADR-0020 ListShell cluster list + right detail panel.
// CreateClusterModal opens on "Cluster 생성" and navigates to detail on create.

import { VocClusterListShell } from "@/features/voc-cluster/components/detail/VocClusterListShell";
import { useCreateVocCluster } from "@/features/voc-cluster/hooks/useCreateVocCluster";
import { useVocClusterList } from "@/features/voc-cluster/hooks/useVocClusterList";
import { type ApiError, errorMapper, fetchManagedSystems } from "@/lib/api";
import { useMe } from "@/lib/auth/useMe";
import { parseRouteSearch } from '@/lib/router/search';
import type { CreateVocClusterRequest } from "@fops/shared";
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
} from "@fops/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /voc-clusters?managedSystem=:managedSystemId|all&selected=:clusterId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through. The route has no
// Managed System selector UI — the URL param is supported for deep links only.
export const vocClustersSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal("all")]).optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

type VocClustersSearch = z.infer<typeof vocClustersSearchSchema>;
const NO_MANAGED_SYSTEM = '__none__';

export function validateVocClustersSearch(raw: unknown) {
  return parseRouteSearch(vocClustersSearchSchema, raw);
}

export const Route = createFileRoute("/_authed/voc-clusters/")({
  validateSearch: validateVocClustersSearch,
  component: VocClusterListPage,
});

// ── ListShell page ────────────────────────────────────────────────────────────

export function VocClusterListPage(): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const search = useSearch({ strict: false }) as VocClustersSearch;
  const navigate = useNavigate({ from: "/voc-clusters/" });
  const selectedId = search.selected ?? null;
  const managedSystemId = search.managedSystem === "all" ? undefined : search.managedSystem;
  // Shared with the shell's identical call — react-query dedupes by key.
  const listQuery = useVocClusterList(managedSystemId);
  const { data: me } = useMe();
  const canCreate =
    me?.actor.role_level === "admin" || me?.actor.role_level === "developer";

  const selectCluster = React.useCallback(
    (id: string): void => {
      void navigate({ to: "/voc-clusters", search: (prev) => ({ ...prev, selected: id }) });
    },
    [navigate],
  );

  // The shell reports whether it is reconciling a selection that left the
  // VISIBLE list (tab filter or refetch) or the user closed the panel. A
  // reconcile replaces (no Back trap); a genuine close pushes so Back re-opens.
  const closeDetail = React.useCallback(
    (opts?: { reconcile?: boolean }): void => {
      void navigate({
        to: "/voc-clusters",
        replace: opts?.reconcile === true,
        search: ({ selected: _selected, ...rest }) => rest,
      });
    },
    [navigate],
  );

  // First-row defaulting (original UI behavior): only on the FIRST successful
  // load, only when the URL carries no explicit `selected`, via replace so a
  // deep link / Back is never overridden and closing does not re-open.
  const appliedDefaultRef = React.useRef(false);
  React.useEffect(() => {
    if (!listQuery.isSuccess || appliedDefaultRef.current) return;
    appliedDefaultRef.current = true;
    if (selectedId === null) {
      const first = listQuery.data?.items[0];
      if (first) {
        void navigate({
          to: "/voc-clusters",
          replace: true,
          search: (prev) => ({ ...prev, selected: first.id }),
        });
      }
    }
  }, [listQuery.data, listQuery.isSuccess, navigate, selectedId]);

  return (
    <>
      <VocClusterListShell
        selectedId={selectedId}
        onSelect={selectCluster}
        onCloseDetail={closeDetail}
        defaultToFirst={false}
        managedSystemId={managedSystemId}
        toolbarActions={
          canCreate ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="cluster-create-button"
            >
              <Plus className="h-4 w-4" />
              Cluster 생성
            </Button>
          ) : (
            <span
              className="text-xs text-text-muted"
              data-testid="cluster-create-hint"
            >
              관리자 또는 개발자 권한이 필요합니다.
            </span>
          )
        }
      />

      {canCreate && (
        <CreateClusterModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            void navigate({
              to: "/voc-clusters/$clusterId",
              params: { clusterId: id },
            });
          }}
        />
      )}
    </>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateClusterModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}): React.ReactElement {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [managedSystemId, setManagedSystemId] = useState("");
  const [managedSystemError, setManagedSystemError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const managedSystemTriggerRef = React.useRef<HTMLButtonElement>(null);

  const systemsQuery = useQuery({
    queryKey: ["managed-systems", { includeArchived: false }] as const,
    queryFn: ({ signal }) =>
      fetchManagedSystems({ includeArchived: false, signal }),
    retry: false,
  });

  const mutation = useCreateVocCluster();

  function closeAndReset() {
    setTitle("");
    setSummary("");
    setManagedSystemId("");
    setManagedSystemError(null);
    setError(null);
    mutation.reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (managedSystemId === '') {
      setManagedSystemError('Managed System을 선택하세요.');
      managedSystemTriggerRef.current?.focus();
      return;
    }
    setManagedSystemError(null);
    const body: CreateVocClusterRequest = {
      title,
      primary_managed_system_id: managedSystemId,
      ...(summary.trim() ? { summary } : {}),
    };
    mutation.mutate(body, {
      onSuccess: (cluster) => {
        closeAndReset();
        onCreated(cluster.id);
      },
      onError: (err: ApiError) => {
        setError(errorMapper(err.envelope).message);
        toast.error(errorMapper(err.envelope).message);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent data-testid="create-cluster-modal">
        <DialogHeader>
          <DialogTitle>Cluster 생성</DialogTitle>
        </DialogHeader>
        <form
          id="create-cluster-form"
          data-testid="create-cluster-form"
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="cluster-title" tone="secondary">
              제목 <span aria-hidden>*</span>
            </FieldLabel>
            <Input
              id="cluster-title"
              required
              value={title}
              placeholder="Cluster 제목을 입력하세요."
              onChange={(e) => setTitle(e.target.value)}
              data-testid="cluster-title-input"
            />
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="cluster-summary" tone="secondary">
              요약 (선택)
            </FieldLabel>
            <Textarea
              id="cluster-summary"
              rows={3}
              value={summary}
              placeholder="Cluster에 대한 간단한 설명을 입력하세요."
              onChange={(e) => setSummary(e.target.value)}
              data-testid="cluster-summary-input"
            />
          </div>

          {/* Managed System */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="cluster-managed-system"
              tone="secondary"
            >
              Managed System <span aria-hidden>*</span>
            </FieldLabel>
            <Select
              value={managedSystemId || NO_MANAGED_SYSTEM}
              onValueChange={(value) => {
                setManagedSystemId(value === NO_MANAGED_SYSTEM ? '' : value);
                setManagedSystemError(null);
              }}
            >
              <SelectTrigger
                ref={managedSystemTriggerRef}
                id="cluster-managed-system"
                aria-label="Managed System"
                aria-required="true"
                aria-invalid={managedSystemError !== null}
                {...(managedSystemError
                  ? { 'aria-describedby': 'cluster-managed-system-error' }
                  : {})}
                data-testid="cluster-managed-system-select"
                appearance="field"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGED_SYSTEM}>시스템 선택…</SelectItem>
                {(systemsQuery.data?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {managedSystemError ? (
              <p
                id="cluster-managed-system-error"
                role="alert"
                className="text-sm text-accent-danger"
              >
                {managedSystemError}
              </p>
            ) : null}
          </div>

          {error && (
            <p
              data-testid="create-cluster-error"
              className="text-sm text-accent-danger"
            >
              {error}
            </p>
          )}
        </form>

        <DialogFooter spacing="compact">
          <Button
            type="button"
            variant="secondary"
            onClick={closeAndReset}
            disabled={mutation.isPending}
            data-testid="create-cluster-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="create-cluster-form"
            disabled={mutation.isPending}
            data-testid="create-cluster-submit"
          >
            생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
