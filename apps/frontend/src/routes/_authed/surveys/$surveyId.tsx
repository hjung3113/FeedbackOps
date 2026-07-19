import { EmptyState, ListShell, PermissionBlockedPanel } from '@fops/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SurveyBuilder } from '@/features/surveys/components/builder/SurveyBuilder';
import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import { useSurvey } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { z } from 'zod';

const searchSchema = z.object({ builder: z.boolean().optional() }).strict();
export const Route = createFileRoute('/_authed/surveys/$surveyId')({ validateSearch: (raw) => searchSchema.parse(raw), component: SurveyDetailRoute });

export function SurveyDetailRoute() {
  const { surveyId } = Route.useParams(); const search = Route.useSearch(); const navigate = useNavigate(); const query = useSurvey(surveyId); const gate = useSurveyManageGate(query.data?.primary_managed_system_id);
  if (query.isLoading) return <div className="p-6 text-sm text-text-muted">불러오는 중…</div>;
  if (query.isError || !query.data) return <EmptyState title="설문을 찾을 수 없습니다." body="삭제되었거나 접근 권한이 없습니다." />;
  if (search.builder) {
    if (!gate.canManage) return <div className="p-6"><PermissionBlockedPanel state="blocked_not_requestable" category="Survey Builder" reason="설문 관리 권한이 없습니다." /></div>;
    return <SurveyBuilder survey={query.data} canManage {...(gate.gateState ? { gateState: gate.gateState } : {})} onBack={() => void navigate({ to: '/surveys/$surveyId', params: { surveyId } })} />;
  }
  return <ListShell list={<div className="p-4"><button type="button" onClick={() => void navigate({ to: '/surveys' })} className="mb-3 text-sm text-text-muted">← Surveys</button><SurveyDetail survey={query.data} canManage={gate.canManage} /></div>} />;
}
