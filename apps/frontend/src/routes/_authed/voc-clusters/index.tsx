// /voc-clusters — VOC Cluster list + create flow.
// Mirrors admin/managed-systems.tsx structure: PageShell, table of clusters,
// CreateClusterModal opens on "클러스터 생성" button, navigates to detail on create.

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
  OutlineBadge,
  PageShell,
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

export const Route = createFileRoute('/_authed/voc-clusters/')({
  component: VocClusterListPage,
});

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const label = status === 'confirmed' ? '확정' : '초안';
  return (
    <OutlineBadge
      data-testid={`cluster-status-badge-${status}`}
    >
      {label}
    </OutlineBadge>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function VocClusterListPage(): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: me } = useMe();
  const canCreate =
    me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  return (
    <PageShell
      header={{
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
    >
      <ClusterListBody
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        canCreate={canCreate}
      />
    </PageShell>
  );
}

// ── Body ──────────────────────────────────────────────────────────────────────

function ClusterListBody({
  createOpen,
  setCreateOpen,
  canCreate,
}: {
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  canCreate: boolean;
}): React.ReactElement {
  const navigate = useNavigate();
  const listQuery = useVocClusterList();
  const clusters = listQuery.data?.items ?? [];

  return (
    <section className="space-y-6">
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            클러스터 목록
          </h3>
          <span className="text-xs text-text-muted">{clusters.length}개</span>
        </div>

        {listQuery.isPending ? (
          <div className="space-y-2" data-testid="cluster-list-skeleton">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : listQuery.isError ? (
          <p className="text-sm text-accent-danger" data-testid="cluster-list-error">
            데이터를 불러오지 못했습니다.
          </p>
        ) : clusters.length === 0 ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted"
            data-testid="cluster-empty-state"
          >
            생성된 클러스터가 없습니다.
          </div>
        ) : (
          <div
            data-testid="cluster-list"
            className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
          >
            {clusters.map((c, i) => (
              <ClusterRow
                key={c.id}
                cluster={c}
                last={i === clusters.length - 1}
                onClick={() =>
                  void navigate({
                    to: '/voc-clusters/$clusterId',
                    params: { clusterId: c.id },
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {canCreate && (
        <CreateClusterModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            void navigate({ to: '/voc-clusters/$clusterId', params: { clusterId: id } });
          }}
        />
      )}
    </section>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ClusterRow({
  cluster,
  last,
  onClick,
}: {
  cluster: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    members?: { voc_id: string }[] | undefined;
  };
  last: boolean;
  onClick: () => void;
}): React.ReactElement {
  const memberCount = cluster.members?.length ?? 0;
  const createdDate = new Date(cluster.created_at).toLocaleDateString('ko-KR');

  return (
    <button
      type="button"
      data-testid={`cluster-row-${cluster.id}`}
      className={`grid w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-row-hover${last ? '' : ' border-b border-border-subtle'}`}
      style={{ gridTemplateColumns: '1fr 90px 60px 100px' }}
      onClick={onClick}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">{cluster.title}</div>
        <div className="truncate font-mono text-xs text-text-muted">{cluster.id.slice(0, 8)}…</div>
      </div>
      <StatusBadge status={cluster.status} />
      <span className="text-xs text-text-muted">VOC {memberCount}개</span>
      <span className="text-xs text-text-muted">{createdDate}</span>
    </button>
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
              className="h-9 w-full rounded-md border border-border-default bg-surface-input px-3 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
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
