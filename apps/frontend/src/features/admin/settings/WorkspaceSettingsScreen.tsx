import { Button, Callout, Input, PageShell, PanelSectionTitle } from '@fops/ui';
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
    label: 'Cross-Managed-System linking',
    description:
      '다른 Managed System 의 entity 를 참조·연결할 수 있는지 결정합니다. 차단된 경우 PermissionBlockedPanel 로 표시됩니다.',
    value: 'Blocked (request only)',
  },
  {
    label: 'Permission request appeal window',
    description: '명시 거부(denied) 이후 재요청을 허용하는 기간입니다. 0 이면 정책 갱신 전까지 재요청 불가.',
    value: '0 days',
  },
];

const lockedSurveySettings: LockedSetting[] = [
  {
    label: 'Survey Response → VOC',
    description:
      '응답을 VOC 로 자동 변환하는 것은 정책으로 금지됩니다. Create Finding / Link Finding / Request Task / Add Evidence Highlight / 기존 VOC 에 근거 연결 만 허용됩니다.',
    value: 'Forbidden',
    valueTone: 'red',
  },
];

const lockedScopeSettings: LockedSetting[] = [
  {
    label: 'Default Managed System scope (Developer)',
    description: 'Developer 가 처음 로그인할 때 적용되는 효과적 scope 의 union 기준값입니다.',
    value: 'Assigned systems only',
  },
  {
    label: 'all = workspace-wide',
    description:
      'Admin 만 all 을 workspace-wide 로 해석합니다. 다른 역할은 effective scope union (교집합 = workspace ∩ grants) 으로 해석합니다.',
    value: 'Admin only',
  },
];

const subtitle =
  '권한 정책 · 익명 임계값 · cross-MS 정책 같이 워크스페이스 전역 동작을 결정하는 설정입니다.';

const settingLabels: Record<EditableKey, string> = {
  permission_self_approval: 'Self-approval',
  survey_anonymity_threshold: 'Anonymity threshold',
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
    <PageShell header={{ title: 'Workspace settings', subtitle }}>
      {settingsQuery.isPending ? (
        <p className="text-sm text-text-muted" data-testid="workspace-settings-loading">
          Loading…
        </p>
      ) : settingsQuery.isError || !settingsQuery.data ? (
        <p className="text-sm text-accent-danger" data-testid="workspace-settings-error">
          Workspace settings를 불러오지 못했습니다.
        </p>
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
      ? 'Retro 영향: 기존 데이터는 그대로 유지됩니다'
      : 'Retro 영향: 백로그 일부가 자동 해제될 수 있습니다';
  const selfApprovalWarningLines =
    draft.permission_self_approval === 'forbidden'
      ? [
          '과거 self-approval 기록 — 감사 로그에 SELF_APPROVAL 라벨로 영구 보존 · 회수되지 않음',
          'active self-approval capability — 만료일까지 유지 · 갱신 시 새 정책 기준으로 평가',
          'pending self-approval request — 저장 시점부터 reviewer 배정 필요 · 요청자에게 알림 발송',
        ]
      : [
          'active capability grant — 기존 grant 유지 · 새 self-approval 은 capability 없이도 허용 (감사 라벨은 동일)',
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
        <PanelSectionTitle>Permission policy</PanelSectionTitle>
        <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
          <EditableOptionRow
            editing={editing === 'permission_self_approval'}
            isDirty={selfApprovalDirty}
            label="Self-approval of Permission Request"
            description="요청자가 직접 자기 Permission Request 를 승인하려면 scoped capability 가 필요합니다. 감사 로그에 SELF_APPROVAL 라벨로 표시됩니다."
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
        {selfApprovalDirty && (
          <Callout
            className="mt-3"
            tone={draft.permission_self_approval === 'forbidden' ? 'amber' : 'info'}
            icon={<AlertTriangle className="h-4 w-4" />}
            title={selfApprovalWarningTitle}
          >
            <p>
              정책 변경은 <strong>비소급</strong>입니다. 저장 시점부터 적용되며, 과거 데이터는 표시된 규칙에 따라 처리됩니다.
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
        <PanelSectionTitle>Survey policy</PanelSectionTitle>
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
        <PanelSectionTitle>Scope defaults</PanelSectionTitle>
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
          <AlertTriangle className="h-4 w-4 text-accent-warning" aria-hidden="true" />
          <span className="text-sm text-text-primary">
            {dirtyKeys.length} unsaved {dirtyKeys.length === 1 ? 'change' : 'changes'}
          </span>
          <span className="text-xs text-text-muted">
            {dirtyKeys.map((key) => settingLabels[key]).join(' · ')}
          </span>
          <Button variant="subtle" size="sm" onClick={discard}>
            Discard
          </Button>
          <Button variant="primary" size="sm" disabled={!canSave} onClick={() => void save()}>
            <Check className="h-4 w-4" />
            Save changes
          </Button>
        </div>
      )}
      {updateMutation.isError && (
        <p className="text-sm text-accent-danger" role="alert">
          Workspace settings 저장에 실패했습니다.
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
      className={`grid gap-4 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_220px_88px] ${last ? '' : 'border-b border-border-subtle'} ${dirty ? 'bg-surface-row-selected' : ''}`}
    >
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {dirty && (
            <span className="rounded-sm bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
              Unsaved
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
        {dirty && (
          <p className="mt-1 text-xs text-accent-warning">
            Previously: <strong>{previousValue}</strong>
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
      previousValue={savedValue === 'allowed' ? 'Allowed' : 'Forbidden'}
    >
      <div className="flex items-center justify-end">
        {editing ? (
          <select
            aria-label="Self-approval"
            className="h-10 w-full rounded-md border border-border-subtle bg-surface-field px-3 text-sm text-text-primary"
            value={value}
            onChange={(event) => onChange(event.target.value as PermissionSelfApproval)}
          >
            <option value="allowed">Allowed</option>
            <option value="forbidden">Forbidden</option>
          </select>
        ) : (
          <span className="text-sm font-medium text-text-primary">
            {value === 'allowed' ? 'Allowed' : 'Forbidden'}
          </span>
        )}
      </div>
      <div className="text-right">
        <Button variant="subtle" size="sm" onClick={editing ? onDone : onEdit}>
          {editing ? 'Done' : 'Edit'}
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
      label="Anonymity threshold"
      description="결과 요약·필터에서 가시 응답이 이 값 미만으로 줄어들면 버킷이 자동으로 머지·가려집니다."
      dirty={isDirty}
      previousValue={`${savedValue} responses`}
    >
      <div className="text-right">
        {editing ? (
          <>
            <Input
              aria-label="Anonymity threshold"
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
          <span className="text-sm font-medium text-text-primary">{value} responses</span>
        )}
      </div>
      <div className="text-right">
        <Button variant="subtle" size="sm" onClick={editing ? onDone : onEdit}>
          {editing ? 'Done' : 'Edit'}
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
      <div className="flex items-center justify-end">
        <span
          className={`text-sm font-medium ${valueTone === 'red' ? 'text-accent-danger' : 'text-text-primary'}`}
          data-testid={
            label === 'Survey Response → VOC' ? 'locked-value-survey-response-to-voc' : undefined
          }
        >
          {value}
        </span>
      </div>
      <div className="flex items-end text-right">
        <span className="inline-flex items-center gap-1 rounded-sm bg-surface-row-hover px-2 py-1 text-xs text-text-muted">
          <LockKeyhole className="h-3 w-3" aria-hidden="true" /> Locked
        </span>
      </div>
    </SettingRow>
  );
}
