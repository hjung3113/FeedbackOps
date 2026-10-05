import {
  type ApiError,
  errorMapper,
  linkTaskToFinding,
  listTasks,
  useIdempotencyKey,
} from '@/lib/api';
import type { FindingDto } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

interface LinkTaskModalProps {
  finding: FindingDto;
  open: boolean;
  onClose: () => void;
}

export function LinkTaskModal({ finding, open, onClose }: LinkTaskModalProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = React.useState('');
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'finding-link-picker'] as const,
    queryFn: ({ signal }) => listTasks({ signal }),
    enabled: open,
    staleTime: 30_000,
  });
  const candidates = React.useMemo(
    () =>
      (tasksQuery.data?.items ?? []).filter(
        (task) => task.primary_managed_system_id === finding.primary_managed_system_id,
      ),
    [finding.primary_managed_system_id, tasksQuery.data?.items],
  );
  const mutation = useMutation({
    mutationFn: (taskId: string) =>
      linkTaskToFinding(finding.id, { task_id: taskId }, idempotencyKey),
    onSuccess: () => {
      markConsumed();
      toast.success('Task가 Finding에 연결되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['finding', finding.id] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  React.useEffect(() => {
    if (!open) setSelectedTaskId('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Task 연결</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {tasksQuery.isLoading ? (
            <p className="text-sm text-text-muted">Task 불러오는 중...</p>
          ) : tasksQuery.isError ? (
            <div className="grid gap-2" role="alert">
              <p className="text-sm text-text-danger">Task 목록을 불러오지 못했습니다.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void tasksQuery.refetch();
                }}
              >
                다시 시도
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-text-muted">
              연결 가능한 같은 Managed System Task가 없습니다.
            </p>
          ) : (
            <>
              <FieldLabel htmlFor="link-task-select">Task</FieldLabel>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger id="link-task-select">
                  <SelectValue placeholder="기존 Task 선택" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title} · {task.display_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <DialogFooter spacing="compact">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => selectedTaskId && mutation.mutate(selectedTaskId)}
            disabled={!selectedTaskId || mutation.isPending}
            data-testid="link-task-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
