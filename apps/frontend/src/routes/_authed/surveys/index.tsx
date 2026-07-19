import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fops/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { ListShell } from '@fops/ui';
import { SurveyList } from '@/features/surveys/components/list/SurveyList';
import { useSurveys } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import type { Survey, SurveyType } from '@/features/surveys/types';
import { apiClient } from '@/lib/api';

export const Route = createFileRoute('/_authed/surveys/')({ component: SurveysIndexRoute });

export function SurveysIndexRoute() {
  const navigate = useNavigate();
  const query = useSurveys();
  const gate = useSurveyManageGate();
  const [createOpen, setCreateOpen] = React.useState(false);
  return <><ListShell toolbar={{ title: 'Surveys', actions: gate.canManage ? <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="survey-create-button">설문 생성</Button> : undefined }} list={<SurveyList surveys={query.data ?? []} isLoading={query.isLoading} error={query.error} onSelect={(id) => void navigate({ to: '/surveys/$surveyId', params: { surveyId: id } })} />}/>{gate.canManage && <CreateSurveyDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(survey) => void navigate({ to: '/surveys/$surveyId', params: { surveyId: survey.id }, search: { builder: true } })} />}</>;
}

function CreateSurveyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (survey: Survey) => void }) {
  const [title, setTitle] = React.useState(''); const [type, setType] = React.useState<SurveyType>('discovery'); const [system, setSystem] = React.useState('');
  const create = useMutation({ mutationFn: async () => (await apiClient<Survey>('POST', '/surveys', { body: { title, type, primary_managed_system_id: system, responses_identity_protected: true } })).data, onSuccess: onCreated });
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}><DialogContent><DialogHeader><DialogTitle>설문 생성</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><label className="block text-sm">제목<Input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label className="block text-sm">Survey type<Select value={type} onValueChange={(value) => setType(value as SurveyType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="discovery">discovery</SelectItem><SelectItem value="validation">validation</SelectItem><SelectItem value="outcome">outcome</SelectItem></SelectContent></Select></label><label className="block text-sm">Managed System ID<Input value={system} onChange={(event) => setSystem(event.target.value)} required /></label>{create.isError && <p className="text-sm text-text-danger">설문을 만들지 못했습니다.</p>}<Button type="submit" disabled={create.isPending}>초안 만들기</Button></form></DialogContent></Dialog>;
}
