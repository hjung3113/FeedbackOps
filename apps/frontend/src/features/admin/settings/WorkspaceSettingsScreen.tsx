import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { GLOSSARY } from '@/lib/copy/glossary';

import {
  Button,
  Callout,
  Input,
  PageShell,
  PanelSectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { AlertTriangle, Check, LockKeyhole } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
  type PermissionSelfApproval,
  type UpdateWorkspaceSettings,
  type WorkspaceSettings,
  useUpdateWorkspaceSettings,
  useWorkspaceSettings,
} from './use-workspace-settings.js';

type EditableKey = keyof WorkspaceSettings;

interface LockedSetting {
  label: string;
  description: string;
  value: string;
  valueTone?: 'red';
}

const lockedPermissionSettings: LockedSetting[] = [
  {
    label: 'Managed System 간 연결',
    description:
      '다른 Managed System의 항목을 참조하거나 연결할 수 있는지 결정합니다. 접근할 수 없는 항목에는 차단 안내가 표시됩니다.',
    value: '차단 (요청만 가능)',
  },
  {
    label: '권한 요청 재신청 기간',
    description:
      '명시 거부 이후 재요청을 허용하는 기간입니다. 0이면 정책 갱신 전까지 재요청할 수 없습니다.',
    value: '0일',
  },
];

const lockedSurveySettings: LockedSetting[] = [
  {
    label: 'Survey 응답 → VOC',
    description:
      'Survey 응답을 VOC로 자동 변환하는 것은 정책으로 금지됩니다. Finding 생성, Evidence 연결, Task 요청, 기존 VOC에 근거 연결만 허용됩니다.',
    value: '금지',
    valueTone: 'red',
  },
];

const lockedScopeSettings: LockedSetting[] = [
  {
    label: '개발자의 기본 Managed System 범위',
    description: '개발자가 처음 로그인할 때 적용되는 유효 범위의 합집합 기준값입니다.',
    value: '내 담당 시스템만',
  },
  {
    label: 'all = 워크스페이스 전체',
    description:
      '관리자만 all을 워크스페이스 전체로 해석합니다. 다른 역할은 유효 범위의 합집합 (교집합 = 워크스페이스 ∩ 부여된 범위)으로 해석합니다.',
    value: '관리자만',
  },
];

const subtitle =
  '권한 정책 · 익명성 임계값 · Managed System 간 연결 정책 등 워크스페이스 전역 동작을 정하는 설정입니다.';

const settingLabels: Record<EditableKey, string> = {
  permission_self_approval: '권한 요청 직접 승인',
  survey_anonymity_threshold: '익명성 임계값',
};

function changedFields(
  saved: WorkspaceSettings,
  draft: WorkspaceSettings,
): UpdateWorkspaceSettings {
  const patch: UpdateWorkspaceSettings = {};
  if (saved.permission_self_approval !== draft.permission_self_approval) {
    patch.permission_self_approval = draft.permission_self_approval;
  }
  if (saved.survey_anonymity_threshold !== draft.survey_anonymity_threshold) {
    patch.survey_anonymity_threshold = draft.survey_anonymity_threshold;
  }
  return patch;
}

function isThresholdValid(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 50;
}

export function WorkspaceSettingsScreen() {
  const settingsQuery = useWorkspaceSettings();

  return (
    <PageShell header={{ title: '워크스페이스 설정', subtitle }}>
      {settingsQuery.isPending ? (
        <p className="text-sm text-text-muted" data-testid="workspace-settings-loading">
          불러오는 중…
        </p>
      ) : settingsQuery.isError || !settingsQuery.data ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-accent-danger" data-testid="workspace-settings-error">
            워크스페이스 설정을 불러오지 못했습니다.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void settingsQuery.refetch()}
          >
            다시 시도
          </Button>
        </div>
      ) : (
        <WorkspaceSettingsForm initialSettings={settingsQuery.data} />
      )}
    </PageShell>
  );
}

export function WorkspaceSettingsForm({ initialSettings }: { initialSettings: WorkspaceSettings }) {
  const updateMutation = useUpdateWorkspaceSettings();
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [editing, setEditing] = useState<EditableKey | null>(null);

  useEffect(() => {
    setSaved(initialSettings);
    setDraft(initialSettings);
  }, [initialSettings]);

  const patch = changedFields(saved, draft);
  const dirtyKeys = Object.keys(patch) as EditableKey[];
  const thresholdValid = isThresholdValid(draft.survey_anonymity_threshold);
  const canSave = dirtyKeys.length > 0 && thresholdValid && !updateMutation.isPending;
  const selfApprovalDirty = dirtyKeys.includes('permission_self_approval');
  const selfApprovalWarningTitle =
    draft.permission_self_approval === 'forbidden'
      ? '소급 영향: 기존 데이터는 그대로 유지됩니다'
      : '소급 영향: 백로그 일부가 자동 해제될 수 있습니다';
  const selfApprovalWarningLines =
    draft.permission_self_approval === 'forbidden'
      ? [
          '과거의 직접 승인 기록은 감사 로그에 SELF_APPROVAL 라벨로 영구 보존되며 회수되지 않습니다.',
          '활성 직접 승인 권한은 만료일까지 유지되며 갱신 시 새 정책 기준으로 평가됩니다.',
          '대기 중인 직접 승인 요청은 저장 시점부터 검토자가 배정되어야 하며 요청자에게 알림이 발송됩니다.',
          ADMIN_PERMISSIONS_COPY.selfDenyLiftForbidden,
        ]
      : [
          '활성 권한 부여는 유지됩니다. 새 직접 승인은 권한 없이도 허용되며 감사 라벨은 동일합니다.',
        ];

  function updateDraft<K extends EditableKey>(key: K, value: WorkspaceSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!canSave) return;
    try {
      const next = await updateMutation.mutateAsync(patch);
      setSaved(next);
      setDraft(next);
      setEditing(null);
    } catch {
      // Keep the local draft intact so the Admin can retry or discard it.
    }
  }

  function discard() {
    setDraft(saved);
    setEditing(null);
  }

  return (
    <div className="space-y-6" data-testid="workspace-settings-screen">
      <section>
        <PanelSectionTitle>권한 정책</PanelSectionTitle>
        <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
          <EditableOptionRow
            editing={editing === 'permission_self_approval'}
            isDirty={selfApprovalDirty}
            label="권한 요청 직접 승인"
            description="요청자가 직접 자기 권한 요청을 승인하려면 범위 내 권한이 필요합니다. 감사 로그에 SELF_APPROVAL 라벨로 표시됩니다."
            value={draft.permission_self_approval}
            savedValue={saved.permission_self_approval}
            onChange={(value) => updateDraft('permission_self_approval', value)}
            onEdit={() => setEditing('permission_self_approval')}
            onDone={() => setEditing(null)}
          />
          {lockedPermissionSettings.map((setting, index) => (
            <LockedRow
              key={setting.label}
              {...setting}
              last={index === lockedPermissionSettings.length - 1}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Task Request 자가승인은 ADR-0026 규칙을 따르며 이 설정과 무관합니다.
        </p>
        {selfApprovalDirty && (
          <Callout
            className="mt-3"
            tone="amber"
            icon={<AlertTriangle className="h-4 w-4" />}
            title={selfApprovalWarningTitle}
          >
            <p>
              정책 변경은 <strong>비소급</strong>입니다. 저장 시점부터 적용되며, 과거 데이터는
              표시된 규칙에 따라 처리됩니다.
            </p>
            <div className="mt-2 space-y-1.5">
              {selfApprovalWarningLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </Callout>
        )}
      </section>

      <section>
        <PanelSectionTitle>Survey 정책</PanelSectionTitle>
        <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
          <EditableThresholdRow
            editing={editing === 'survey_anonymity_threshold'}
            isDirty={dirtyKeys.includes('survey_anonymity_threshold')}
            value={draft.survey_anonymity_threshold}
            savedValue={saved.survey_anonymity_threshold}
            valid={thresholdValid}
            onChange={(value) => updateDraft('survey_anonymity_threshold', value)}
            onEdit={() => setEditing('survey_anonymity_threshold')}
            onDone={() => setEditing(null)}
          />
          {lockedSurveySettings.map((setting) => (
            <LockedRow key={setting.label} {...setting} last />
          ))}
        </div>
      </section>

      <section>
        <PanelSectionTitle>범위 기본값</PanelSectionTitle>
        <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
          {lockedScopeSettings.map((setting, index) => (
            <LockedRow
              key={setting.label}
              {...setting}
              last={index === lockedScopeSettings.length - 1}
            />
          ))}
        </div>
      </section>

      {dirtyKeys.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border-strong bg-surface-popover px-4 py-3 shadow-lg"
          data-testid="workspace-settings-save-bar"
        >
          <AlertTriangle className="h-4 w-4 text-text-warning" aria-hidden="true" />
          <span className="text-sm text-text-primary">
            {dirtyKeys.length === 1
              ? '저장되지 않은 변경 1건'
              : `저장되지 않은 변경 ${dirtyKeys.length}건`}
          </span>
          <span className="text-xs text-text-muted">
            {dirtyKeys.map((key) => settingLabels[key]).join(' · ')}
          </span>
          <Button variant="subtle" size="sm" onClick={discard}>
            버리기
          </Button>
          <Button variant="primary" size="sm" disabled={!canSave} onClick={() => void save()}>
            <Check className="h-4 w-4" />
            변경사항 {GLOSSARY.save}
          </Button>
        </div>
      )}
      {updateMutation.isError && (
        <p className="text-sm text-accent-danger" role="alert">
          워크스페이스 설정 저장에 실패했습니다.
        </p>
      )}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
  last = false,
  dirty = false,
  previousValue,
}: {
  label: string;
  description: string;
  children: ReactNode;
  last?: boolean;
  dirty?: boolean;
  previousValue?: ReactNode;
}) {
  return (
    <div
      className={`grid items-start gap-4 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_220px_88px] ${last ? '' : 'border-b border-border-subtle'} ${dirty ? 'bg-surface-row-selected' : ''}`}
    >
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {dirty && (
            <span className="rounded-sm bg-accent-primary/15 px-1.5 py-0.5 text-caption font-medium text-accent-primary">
              변경됨
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
        {dirty && (
          <p className="mt-1 text-xs text-text-warning-label">
            이전 값: <strong>{previousValue}</strong>
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function EditableOptionRow({
  editing,
  isDirty,
  label,
  description,
  value,
  savedValue,
  onChange,
  onEdit,
  onDone,
}: {
  editing: boolean;
  isDirty: boolean;
  label: string;
  description: string;
  value: PermissionSelfApproval;
  savedValue: PermissionSelfApproval;
  onChange: (value: PermissionSelfApproval) => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      dirty={isDirty}
      previousValue={savedValue === 'allowed' ? '허용' : '금지'}
    >
      <div className="flex items-start justify-end">
        {editing ? (
          <Select
            value={value}
            onValueChange={(nextValue) => onChange(nextValue as PermissionSelfApproval)}
          >
            <SelectTrigger aria-label="직접 승인">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allowed">허용</SelectItem>
              <SelectItem value="forbidden">금지</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm font-medium text-text-primary">
            {value === 'allowed' ? '허용' : '금지'}
          </span>
        )}
      </div>
      <div className="flex h-5 items-center justify-end">
        <Button variant="secondary" size="sm" onClick={editing ? onDone : onEdit}>
          {editing ? '완료' : GLOSSARY.edit}
        </Button>
      </div>
    </SettingRow>
  );
}

function EditableThresholdRow({
  editing,
  isDirty,
  value,
  savedValue,
  valid,
  onChange,
  onEdit,
  onDone,
}: {
  editing: boolean;
  isDirty: boolean;
  value: number;
  savedValue: number;
  valid: boolean;
  onChange: (value: number) => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  return (
    <SettingRow
      label="익명성 임계값"
      description="결과 요약·필터에서 가시 응답이 이 값 미만으로 줄어들면 버킷이 자동으로 머지·가려집니다."
      dirty={isDirty}
      previousValue={`응답 ${savedValue}건`}
    >
      <div className="text-right">
        {editing ? (
          <>
            <Input
              aria-label="익명성 임계값"
              type="number"
              min={5}
              max={50}
              value={Number.isNaN(value) ? '' : value}
              onChange={(event) => onChange(Number(event.target.value))}
            />
            <p
              className={valid ? 'mt-1 text-xs text-text-muted' : 'mt-1 text-xs text-accent-danger'}
            >
              {valid ? '최소 5 (익명성 보호 기준)' : '5에서 50 사이의 정수를 입력하세요.'}
            </p>
          </>
        ) : (
          <span className="text-sm font-medium text-text-primary">응답 {value}건</span>
        )}
      </div>
      <div className="flex h-5 items-center justify-end">
        <Button variant="secondary" size="sm" onClick={editing ? onDone : onEdit}>
          {editing ? '완료' : GLOSSARY.edit}
        </Button>
      </div>
    </SettingRow>
  );
}

function LockedRow({
  label,
  description,
  value,
  valueTone,
  last,
}: LockedSetting & { last: boolean }) {
  return (
    <SettingRow label={label} description={description} last={last}>
      <div className="flex items-start justify-end">
        <span
          className={`text-sm font-medium ${valueTone === 'red' ? 'text-accent-danger' : 'text-text-primary'}`}
          data-testid={
            label === 'Survey 응답 → VOC' ? 'locked-value-survey-response-to-voc' : undefined
          }
        >
          {value}
        </span>
      </div>
      <div className="flex h-5 items-center justify-end text-right">
        <span className="inline-flex items-center gap-1 rounded-sm bg-surface-row-hover px-2 py-1 text-xs text-text-muted">
          <LockKeyhole className="h-3 w-3" aria-hidden="true" /> 잠김
        </span>
      </div>
    </SettingRow>
  );
}
