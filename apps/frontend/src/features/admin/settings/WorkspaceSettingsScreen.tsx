import { useMe } from '@/lib/auth/useMe';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { COVERAGE_METRIC_LABELS } from '@/lib/copy/coverage';
import { GLOSSARY } from '@/lib/copy/glossary';
import { CLUSTER_SUGGESTION_COPY as SUGGESTIONS } from '@/lib/copy/voc-cluster';
import {
  WORKSPACE_SETTINGS_COVERAGE_COPY,
  coverageBandFieldLabel,
} from '@/lib/copy/workspace-settings';
import {
  clusterSuggestionActorContext,
  useClusterSuggestions,
} from '../../voc-cluster/hooks/useClusterSuggestions';

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
  COVERAGE_METRIC_IDS,
  type CoverageMetricId,
  type CoverageThresholdPair,
  type CoverageThresholds,
} from '@fops/shared';

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
  voc_cluster_suggestions_enabled: SUGGESTIONS.optInLabel,
  coverage_thresholds: WORKSPACE_SETTINGS_COVERAGE_COPY.sectionTitle,
  permission_self_approval: '권한 요청 직접 승인',
  survey_anonymity_threshold: '익명성 임계값',
};

function changedFields(
  saved: WorkspaceSettings,
  draft: WorkspaceSettings,
): UpdateWorkspaceSettings {
  const patch: UpdateWorkspaceSettings = {};
  if (saved.voc_cluster_suggestions_enabled !== draft.voc_cluster_suggestions_enabled) {
    patch.voc_cluster_suggestions_enabled = draft.voc_cluster_suggestions_enabled;
  }
  if (saved.permission_self_approval !== draft.permission_self_approval) {
    patch.permission_self_approval = draft.permission_self_approval;
  }
  if (saved.survey_anonymity_threshold !== draft.survey_anonymity_threshold) {
    patch.survey_anonymity_threshold = draft.survey_anonymity_threshold;
  }
  const coverage = changedCoveragePairs(saved.coverage_thresholds, draft.coverage_thresholds);
  if (coverage !== undefined) {
    patch.coverage_thresholds = coverage;
  }
  return patch;
}

// Only metric pairs that actually differ are sent; the server merges the
// partial map under the singleton lock and audits effective from/to changes.
function changedCoveragePairs(
  saved: CoverageThresholds,
  draft: CoverageThresholds,
): UpdateWorkspaceSettings['coverage_thresholds'] {
  const patch: Partial<CoverageThresholds> = {};
  for (const metric of changedCoverageMetrics(saved, draft)) {
    patch[metric] = draft[metric];
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

// The save bar counts dirty Coverage rows individually (#1087 UX): two edited
// metrics read 커버리지 기준 (2), not one settings key.
function changedCoverageMetrics(
  saved: CoverageThresholds,
  draft: CoverageThresholds,
): CoverageMetricId[] {
  return COVERAGE_METRIC_IDS.filter((metric) => {
    const before = saved[metric];
    const after = draft[metric];
    return (
      before.good_min_percent !== after.good_min_percent ||
      before.warn_min_percent !== after.warn_min_percent
    );
  });
}

// Band inputs keep the raw string while editing (#1087 UX); a cleared field
// parses as invalid instead of writing Number('') = 0 back into the draft.
function parseBandPercent(raw: string): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function isThresholdValid(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 50;
}

// Mirrors coverageThresholdPairSchema: integer 0 <= warn < good <= 100.
function isCoveragePairValid(pair: CoverageThresholdPair): boolean {
  return (
    Number.isInteger(pair.good_min_percent) &&
    Number.isInteger(pair.warn_min_percent) &&
    pair.warn_min_percent >= 0 &&
    pair.warn_min_percent < pair.good_min_percent &&
    pair.good_min_percent <= 100
  );
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
  const { data: me } = useMe();
  const suggestionsQuery = useClusterSuggestions(
    undefined,
    clusterSuggestionActorContext(me),
    !!me?.actor,
  );
  const suggestionsAvailable =
    suggestionsQuery.isSuccess && suggestionsQuery.data?.available === true;
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [editing, setEditing] = useState<EditableKey | CoverageMetricId | null>(null);
  // Raw input strings for the band row being edited; parsed on validate/save
  // (#1087 UX) so an emptied field blocks saving instead of writing 0.
  const [bandRaw, setBandRaw] = useState({ good: '', warn: '' });

  useEffect(() => {
    setSaved(initialSettings);
    setDraft(initialSettings);
  }, [initialSettings]);

  // #1087 UX: 커버리지 기준 편집 links to /admin/settings#coverage; scroll the
  // section into view after the settings data renders it.
  useEffect(() => {
    if (window.location.hash !== '#coverage') return;
    document.getElementById('coverage')?.scrollIntoView();
  }, []);

  const patch = changedFields(saved, draft);
  const dirtyKeys = Object.keys(patch) as EditableKey[];
  const thresholdValid = isThresholdValid(draft.survey_anonymity_threshold);
  const editingMetric =
    editing !== null && (COVERAGE_METRIC_IDS as readonly string[]).includes(editing)
      ? (editing as CoverageMetricId)
      : null;
  const editingBandGood = parseBandPercent(bandRaw.good);
  const editingBandWarn = parseBandPercent(bandRaw.warn);
  const coverageEditingInvalid =
    editingMetric !== null && (editingBandGood === null || editingBandWarn === null);
  const coverageValid = COVERAGE_METRIC_IDS.every((metric) => {
    if (metric === editingMetric) {
      return (
        editingBandGood !== null && editingBandWarn !== null && editingBandWarn < editingBandGood
      );
    }
    return isCoveragePairValid(draft.coverage_thresholds[metric]);
  });
  const canSave =
    dirtyKeys.length > 0 && thresholdValid && coverageValid && !updateMutation.isPending;
  // A parse-invalid band edit keeps the save bar up (저장 disabled) even though
  // the draft pair is unchanged; without it the bar would vanish mid-edit.
  const barKeys: EditableKey[] =
    coverageEditingInvalid && !dirtyKeys.includes('coverage_thresholds')
      ? [...dirtyKeys, 'coverage_thresholds']
      : dirtyKeys;
  const dirtyCoverageCount = changedCoverageMetrics(
    saved.coverage_thresholds,
    draft.coverage_thresholds,
  ).length;
  const settingLabel = (key: EditableKey): string =>
    key === 'coverage_thresholds' && dirtyCoverageCount > 1
      ? `${settingLabels[key]} (${dirtyCoverageCount})`
      : settingLabels[key];
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
      setBandRaw({ good: '', warn: '' });
    } catch {
      // Keep the local draft intact so the Admin can retry or discard it.
    }
  }

  function discard() {
    setDraft(saved);
    setEditing(null);
    setBandRaw({ good: '', warn: '' });
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

      <section id="coverage">
        <PanelSectionTitle>{WORKSPACE_SETTINGS_COVERAGE_COPY.sectionTitle}</PanelSectionTitle>
        <p className="mb-2 text-xs text-text-muted">
          {WORKSPACE_SETTINGS_COVERAGE_COPY.sectionDescription}
        </p>
        <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
          {COVERAGE_METRIC_IDS.map((metric, index) => (
            <CoverageBandRow
              key={metric}
              metric={metric}
              editing={editing === metric}
              isDirty={
                saved.coverage_thresholds[metric].good_min_percent !==
                  draft.coverage_thresholds[metric].good_min_percent ||
                saved.coverage_thresholds[metric].warn_min_percent !==
                  draft.coverage_thresholds[metric].warn_min_percent
              }
              value={draft.coverage_thresholds[metric]}
              savedValue={saved.coverage_thresholds[metric]}
              raw={bandRaw}
              onChangeRaw={(raw) => {
                setBandRaw(raw);
                // The draft pair only takes parsed values; a cleared or
                // non-integer field leaves the last parsed pair in place and
                // blocks saving through coverageEditingInvalid (#1087 UX).
                const good = parseBandPercent(raw.good);
                const warn = parseBandPercent(raw.warn);
                if (good !== null && warn !== null) {
                  updateDraft('coverage_thresholds', {
                    ...draft.coverage_thresholds,
                    [metric]: { good_min_percent: good, warn_min_percent: warn },
                  });
                }
              }}
              onEdit={() => {
                setEditing(metric);
                const pair = draft.coverage_thresholds[metric];
                setBandRaw({
                  good: String(pair.good_min_percent),
                  warn: String(pair.warn_min_percent),
                });
              }}
              onDone={() => setEditing(null)}
              last={index === COVERAGE_METRIC_IDS.length - 1}
            />
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

      {suggestionsAvailable && (
        <section data-testid="cluster-suggestions-setting">
          <PanelSectionTitle>{SUGGESTIONS.tab}</PanelSectionTitle>
          <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
            <EditableOptionRow
              editing={editing === 'voc_cluster_suggestions_enabled'}
              isDirty={dirtyKeys.includes('voc_cluster_suggestions_enabled')}
              label={SUGGESTIONS.optInLabel}
              description={SUGGESTIONS.optInHelp}
              value={String(draft.voc_cluster_suggestions_enabled)}
              savedValue={String(saved.voc_cluster_suggestions_enabled)}
              choices={[
                { value: 'true', label: SUGGESTIONS.enabled },
                { value: 'false', label: SUGGESTIONS.disabled },
              ]}
              fieldLabel={SUGGESTIONS.optInLabel}
              onChange={(value) => updateDraft('voc_cluster_suggestions_enabled', value === 'true')}
              onEdit={() => setEditing('voc_cluster_suggestions_enabled')}
              onDone={() => setEditing(null)}
            />
          </div>
        </section>
      )}

      {barKeys.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border-strong bg-surface-popover px-4 py-3 shadow-lg"
          data-testid="workspace-settings-save-bar"
        >
          <AlertTriangle className="h-4 w-4 text-text-warning" aria-hidden="true" />
          <span className="text-sm text-text-primary">
            {barKeys.length === 1
              ? '저장되지 않은 변경 1건'
              : `저장되지 않은 변경 ${barKeys.length}건`}
          </span>
          <span className="text-xs text-text-muted">
            {barKeys.map((key) => settingLabel(key)).join(' · ')}
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

function EditableOptionRow<Value extends string = PermissionSelfApproval>({
  editing,
  isDirty,
  label,
  description,
  value,
  savedValue,
  onChange,
  onEdit,
  onDone,
  choices = [
    { value: 'allowed', label: '허용' },
    { value: 'forbidden', label: '금지' },
  ],
  fieldLabel = '직접 승인',
}: {
  editing: boolean;
  isDirty: boolean;
  label: string;
  description: string;
  value: Value;
  savedValue: Value;
  choices?: Array<{ value: string; label: string }>;
  fieldLabel?: string;
  onChange: (value: Value) => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      dirty={isDirty}
      previousValue={choices.find((choice) => choice.value === savedValue)?.label}
    >
      <div className="flex items-start justify-end">
        {editing ? (
          <Select value={value} onValueChange={(nextValue) => onChange(nextValue as Value)}>
            <SelectTrigger aria-label={fieldLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm font-medium text-text-primary">
            {choices.find((choice) => choice.value === value)?.label}
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

function CoverageBandRow({
  metric,
  editing,
  isDirty,
  value,
  savedValue,
  raw,
  onChangeRaw,
  onEdit,
  onDone,
  last,
}: {
  metric: CoverageMetricId;
  editing: boolean;
  isDirty: boolean;
  value: CoverageThresholdPair;
  savedValue: CoverageThresholdPair;
  raw: { good: string; warn: string };
  onChangeRaw: (raw: { good: string; warn: string }) => void;
  onEdit: () => void;
  onDone: () => void;
  last: boolean;
}) {
  const hintId = `coverage-band-hint-${metric}`;
  // Distinct invalid states (#1087 UX): name the broken rule, flag the
  // offending input, and point both inputs at the hint.
  const good = parseBandPercent(raw.good);
  const warn = parseBandPercent(raw.warn);
  const rangeInvalid = good === null || warn === null;
  const orderInvalid = !rangeInvalid && warn >= good;
  const hintText = rangeInvalid
    ? WORKSPACE_SETTINGS_COVERAGE_COPY.rangeInvalid
    : orderInvalid
      ? WORKSPACE_SETTINGS_COVERAGE_COPY.orderInvalid
      : WORKSPACE_SETTINGS_COVERAGE_COPY.hint;
  return (
    <SettingRow
      label={COVERAGE_METRIC_LABELS[metric]}
      description={WORKSPACE_SETTINGS_COVERAGE_COPY.rowDescription(metric)}
      dirty={isDirty}
      previousValue={WORKSPACE_SETTINGS_COVERAGE_COPY.savedPair(savedValue)}
      last={last}
    >
      <div className="text-right">
        {editing ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-xs text-text-muted">
                {WORKSPACE_SETTINGS_COVERAGE_COPY.goodPrefix}
              </span>
              <Input
                aria-label={coverageBandFieldLabel(metric, 'good')}
                aria-describedby={hintId}
                {...(good === null ? { 'aria-invalid': true } : {})}
                data-testid={`coverage-band-good-${metric}`}
                type="number"
                min={1}
                max={100}
                value={raw.good}
                onChange={(event) => onChangeRaw({ ...raw, good: event.target.value })}
              />
              <span className="shrink-0 text-xs text-text-muted">%</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="shrink-0 text-xs text-text-muted">
                {WORKSPACE_SETTINGS_COVERAGE_COPY.warnPrefix}
              </span>
              <Input
                aria-label={coverageBandFieldLabel(metric, 'warn')}
                aria-describedby={hintId}
                {...(warn === null || orderInvalid ? { 'aria-invalid': true } : {})}
                data-testid={`coverage-band-warn-${metric}`}
                type="number"
                min={0}
                max={99}
                value={raw.warn}
                onChange={(event) => onChangeRaw({ ...raw, warn: event.target.value })}
              />
              <span className="shrink-0 text-xs text-text-muted">%</span>
            </div>
            <p
              id={hintId}
              className={`mt-1 break-keep text-xs ${
                rangeInvalid || orderInvalid ? 'text-accent-danger' : 'text-text-muted'
              }`}
            >
              {hintText}
            </p>
          </>
        ) : (
          <span
            className="text-sm font-medium text-text-primary"
            data-testid={`coverage-band-value-${metric}`}
          >
            {WORKSPACE_SETTINGS_COVERAGE_COPY.savedPair(value)}
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
