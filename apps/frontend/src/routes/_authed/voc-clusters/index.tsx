// /voc-clusters — ADR-0020 ListShell cluster list + right detail panel.
// CreateClusterModal opens on "클러스터 생성" and navigates to detail on create.

import * as React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ListShell,
  ObjectRow,
  OutlineBadge,
  Skeleton,
  Textarea,
} from '@fops/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { CreateVocClusterRequest } from '@fops/shared';
import { useVocClusterList } from '@/features/voc-cluster/hooks/useVocClusterList';
import { useCreateVocCluster } from '@/features/voc-cluster/hooks/useCreateVocCluster';
import { useMe } from '@/lib/auth/useMe';
import { fetchManagedSystems, errorMapper, type ApiError } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { VocClusterDetailPanel } from './$clusterId';

export const Route = createFileRoute('/_authed/voc-clusters/')({
  component: VocClusterListPage,
});

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const label = status === 'confirmed' ? '확정' : '초안';
  return <OutlineBadge data-testid={`cluster-status-badge-${status}`}>{label}</OutlineBadge>;
}

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
  }).format(new Date(raw));
}

// ── ListShell page ────────────────────────────────────────────────────────────

export function VocClusterListPage(): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data: me } = useMe();
  const listQuery = useVocClusterList();
  const clusters = listQuery.data?.items ?? [];
  const canCreate = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  React.useEffect(() => {
    if (selectedId === null && clusters[0]) setSelectedId(clusters[0].id);
  }, [clusters, selectedId]);

  const selected = selectedId ? (clusters.find((item) => item.id === selectedId) ?? null) : null;

  function selectCluster(id: string): void {
    setSelectedId(id);
    void navigate({
      to: '/voc-clusters/$clusterId',
      params: { clusterId: id },
    });
  }

  return (
    <>
      <ListShell
        toolbar={{
          title: 'VOC 클러스터',
          subtitle: 'VOC를 유사 주제로 묶어 Finding으로 승격합니다.',
          actions: canCreate ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="cluster-create-button"
            >
              <Plus className="h-4 w-4" />
              클러스터 생성
            </Button>
          ) : (
            <span className="text-xs text-text-muted" data-testid="cluster-create-hint">
              Admin 또는 Developer 권한이 필요합니다.
            </span>
          ),
        }}
        list={
          <ClusterListBody
            clusters={clusters}
            isPending={listQuery.isPending}
            isError={listQuery.isError}
            selectedId={selected?.id ?? null}
            onSelect={selectCluster}
          />
        }
        detailPanel={
          selected ? (
            <VocClusterDetailPanel clusterId={selected.id} onClose={() => setSelectedId(null)} />
          ) : undefined
        }
      />

      {canCreate && (
        <CreateClusterModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setSelectedId(id);
            void navigate({ to: '/voc-clusters/$clusterId', params: { clusterId: id } });
          }}
        />
      )}
    </>
  );
}

// ── Body ──────────────────────────────────────────────────────────────────────

function ClusterListBody({
  clusters,
  isPending,
  isError,
  selectedId,
  onSelect,
}: {
  clusters: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    members?: { voc_id: string }[] | undefined;
  }>;
  isPending: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <section className="flex min-h-full flex-col">
      <div className="border-b border-border-subtle px-5 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            클러스터 목록
          </h3>
          <span className="text-xs text-text-muted">{clusters.length}개</span>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2 p-4" data-testid="cluster-list-skeleton">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <p className="p-4 text-sm text-accent-danger" data-testid="cluster-list-error">
          데이터를 불러오지 못했습니다.
        </p>
      ) : clusters.length === 0 ? (
        <div className="p-8 text-center text-sm text-text-muted" data-testid="cluster-empty-state">
          생성된 클러스터가 없습니다.
        </div>
      ) : (
        <div data-testid="cluster-list">
          {clusters.map((cluster) => (
            <ClusterRow
              key={cluster.id}
              cluster={cluster}
              selected={selectedId === cluster.id}
              onClick={() => onSelect(cluster.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ClusterRow({
  cluster,
  selected,
  onClick,
}: {
  cluster: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    members?: { voc_id: string }[] | undefined;
  };
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const memberCount = cluster.members?.length ?? 0;

  return (
    <ObjectRow
      id={shortId(cluster.id)}
      title={cluster.title}
      selected={selected}
      density="default"
      onClick={onClick}
      badges={<StatusBadge status={cluster.status} />}
      meta={
        <>
          <span>VOC {memberCount}개</span>
          {dot()}
          <span>{formatDate(cluster.created_at)}</span>
        </>
      }
    />
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
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [managedSystemId, setManagedSystemId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const systemsQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    retry: false,
  });

  const mutation = useCreateVocCluster();

  function closeAndReset() {
    setTitle('');
    setSummary('');
    setManagedSystemId('');
    setError(null);
    mutation.reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          <DialogTitle>클러스터 생성</DialogTitle>
        </DialogHeader>
        <form
          id="create-cluster-form"
          data-testid="create-cluster-form"
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cluster-title" className="text-text-secondary">
              제목 <span aria-hidden>*</span>
            </Label>
            <Input
              id="cluster-title"
              required
              value={title}
              placeholder="클러스터 제목을 입력하세요."
              onChange={(e) => setTitle(e.target.value)}
              data-testid="cluster-title-input"
            />
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cluster-summary" className="text-text-secondary">
              요약 (선택)
            </Label>
            <Textarea
              id="cluster-summary"
              rows={3}
              value={summary}
              placeholder="클러스터에 대한 간단한 설명을 입력하세요."
              onChange={(e) => setSummary(e.target.value)}
              data-testid="cluster-summary-input"
            />
          </div>

          {/* Managed System */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cluster-managed-system" className="text-text-secondary">
              Managed System <span aria-hidden>*</span>
            </Label>
            <select
              id="cluster-managed-system"
              required
              value={managedSystemId}
              onChange={(e) => setManagedSystemId(e.target.value)}
              data-testid="cluster-managed-system-select"
              className="h-9 w-full rounded-md border border-border-default bg-surface-field px-3 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">시스템 선택…</option>
              {(systemsQuery.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p data-testid="create-cluster-error" className="text-sm text-accent-danger">
              {error}
            </p>
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
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
