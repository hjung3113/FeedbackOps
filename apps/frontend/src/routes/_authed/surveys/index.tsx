import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import { SurveyList } from '@/features/surveys/components/list/SurveyList';
import { useCreateSurvey, useSurvey, useSurveys } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import type { SurveyType } from '@/features/surveys/types';
import { fetchAnalyticsAreas, fetchCapabilityScope, fetchManagedSystems } from '@/lib/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { ListShell } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import * as React from 'react';

export const Route = createFileRoute('/_authed/surveys/')({
  component: SurveysIndexRoute,
});

export function SurveysIndexRoute() {
  const navigate = useNavigate();
  const query = useSurveys();
  const gate = useSurveyManageGate();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = useSurvey(selectedId ?? '');
  const selectedGate = useSurveyManageGate(selected.data?.primary_managed_system_id);
  return (
    <>
      <ListShell
        toolbar={{ title: 'Surveys' }}
        list={
          <SurveyList
            surveys={query.data ?? []}
            isLoading={query.isLoading}
            error={query.error}
            selectedId={selectedId}
            onSelect={setSelectedId}
            canCreate={gate.canManage}
            {...(gate.permissionState !== undefined
              ? { permissionState: gate.permissionState }
              : {})}
            onCreate={() => setCreateOpen(true)}
          />
        }
        detailPanel={
          selected.data ? (
            <SurveyDetail
              survey={selected.data}
              canManage={selectedGate.canManage}
              onClose={() => setSelectedId(null)}
            />
          ) : undefined
        }
      />
      {gate.canManage && (
        <CreateSurveyDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(surveyId) =>
            void navigate({
              to: '/surveys/$surveyId',
              params: { surveyId },
              search: { builder: true },
            })
          }
        />
      )}
    </>
  );
}

export function CreateSurveyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (surveyId: string) => void;
}) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<SurveyType | ''>('');
  const [system, setSystem] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [analyticsArea, setAnalyticsArea] = React.useState('');
  const [identityProtected, setIdentityProtected] = React.useState<'true' | 'false' | ''>('');
  const create = useCreateSurvey();
  const systems = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    enabled: open,
    retry: false,
  });
  const scope = useQuery({
    queryKey: ['permission-scope', 'survey.manage'],
    queryFn: ({ signal }) => fetchCapabilityScope('survey.manage', { signal }),
    enabled: open,
    retry: false,
  });
  const analyticsAreas = useQuery({
    queryKey: ['analytics-areas', { managedSystemId: system, includeArchived: false }],
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({ managedSystemId: system, includeArchived: false, signal }),
    enabled: open && Boolean(system),
    retry: false,
  });
  const allowedSystems = (systems.data?.items ?? []).filter(
    (candidate) =>
      candidate.archived_at === null &&
      (scope.data?.scope.kind === 'all' ||
        (scope.data?.scope.kind === 'scoped' &&
          scope.data.scope.managed_system_ids.includes(candidate.id))),
  );
  const reset = () => {
    setTitle('');
    setType('');
    setSystem('');
    setDescription('');
    setAnalyticsArea('');
    setIdentityProtected('');
    create.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>설문 생성</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || !type || !system || identityProtected === '') return;
            create.mutate(
              {
                type,
                title: title.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                primary_managed_system_id: system,
                ...(analyticsArea ? { analytics_area_id: analyticsArea } : {}),
                responses_identity_protected: identityProtected === 'true',
              },
              {
                onSuccess: (created) => {
                  reset();
                  onCreated(created.id);
                },
              },
            );
          }}
        >
          <label className="block text-sm" htmlFor="survey-title">
            제목
            <Input
              id="survey-title"
              aria-label="제목"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <div className="block text-sm">
            Survey type
            <Select value={type} onValueChange={(value) => setType(value as SurveyType)}>
              <SelectTrigger aria-label="Survey type">
                <SelectValue placeholder="유형 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discovery">discovery</SelectItem>
                <SelectItem value="validation">validation</SelectItem>
                <SelectItem value="outcome">outcome</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="block text-sm">
            Managed System
            <Select
              value={system}
              onValueChange={(value) => {
                setSystem(value);
                setAnalyticsArea('');
              }}
            >
              <SelectTrigger aria-label="Managed System">
                <SelectValue placeholder="Managed System 선택" />
              </SelectTrigger>
              <SelectContent>
                {allowedSystems.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="block text-sm" htmlFor="survey-description">
            설명 (선택)
            <Textarea
              id="survey-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="block text-sm">
            Analytics Area (선택)
            <Select value={analyticsArea} onValueChange={setAnalyticsArea} disabled={!system}>
              <SelectTrigger aria-label="Analytics Area">
                <SelectValue placeholder="선택 안 함" />
              </SelectTrigger>
              <SelectContent>
                {(analyticsAreas.data?.items ?? []).map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="block text-sm">
            응답 익명 보호
            <Select
              value={identityProtected}
              onValueChange={(value) => setIdentityProtected(value as 'true' | 'false')}
            >
              <SelectTrigger aria-label="응답 익명 보호">
                <SelectValue placeholder="보호 여부 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">보호함</SelectItem>
                <SelectItem value="false">보호하지 않음</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {create.isError && <p className="text-sm text-text-danger">설문을 만들지 못했습니다.</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              data-testid="survey-create-cancel"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending || !title.trim() || !type || !system || identityProtected === ''
              }
              data-testid="survey-create-submit"
            >
              초안 만들기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
