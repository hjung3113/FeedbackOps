import type { Survey } from '../../types';
import { SurveyManagedSystemPill } from '../SurveyManagedSystemPill';

export function SurveySettings({
  survey,
  managedSystemName,
}: {
  survey: Survey;
  managedSystemName?: string;
}) {
  return (
    <aside className="border-l border-border-subtle p-4">
      <p className="text-xs uppercase text-text-muted">Survey settings</p>
      <p className="mt-3 text-sm">Managed System</p>
      <SurveyManagedSystemPill name={managedSystemName} />
      <p className="mt-5 text-sm">응답 익명성</p>
      <p className="text-xs text-text-muted">
        {survey.responses_identity_protected
          ? '응답은 익명으로 처리되며 개인을 식별할 수 없습니다.'
          : '응답에 개인 식별자가 포함될 수 있으니 관련 정책을 확인하세요.'}
      </p>
      <p className="mt-5 text-xs text-text-muted">Survey Response → VOC 생성은 금지됩니다.</p>
    </aside>
  );
}
