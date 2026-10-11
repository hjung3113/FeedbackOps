import {
  ANALYTICS_AREA_RECENT_FINDINGS_LABEL,
  ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL,
} from '@/lib/copy/analytics-areas';
import { GLOSSARY } from '@/lib/copy/glossary';

import {
  Button,
  Callout,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemMark,
  ManagedSystemPill,
  OutlineBadge,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  UserChip,
} from '@fops/ui';
import { Layers, Settings, Shield } from 'lucide-react';
import { useRef } from 'react';

import { formatDate } from '@/lib/format/datetime';
import type { AnalyticsAreaDto, ManagedSystemDto, ResolveActorsResponse } from '../../../lib/api';
import { scopeMark } from '../lib/scopeMark.js';
import { teamName } from './teamName.js';

// ============================================================
// AnalyticsAreaSlideOver — 460px read-only AA detail drawer.
// Overview / Guardrail / Definition / Workload / Findings / Used by.
// Built with the @fops/ui sheet (Radix dialog) wrapper; right side, 460px.
// ============================================================
export function AnalyticsAreaSlideOver({
  area,
  ms,
  resolved,
  onOpenChange,
  onEdit,
}: {
  area: AnalyticsAreaDto | null;
  ms: ManagedSystemDto | null;
  resolved: ResolveActorsResponse | undefined;
  onOpenChange: (open: boolean) => void;
  onEdit: (area: AnalyticsAreaDto) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(false);
  if (!area) return null;

  const mark = ms ? scopeMark(ms.slug, ms.name) : null;
  const lead = teamName(area, resolved);
  const created = formatDate(area.created_at);

  // Workload + Findings are Slice 4/5 surfaces (not built). Shells render with
  // "—" placeholders; no counts available from the DTO (locked decision #88).
  const sections: PanelSection[] = [
    { id: 'overview', label: '개요' },
    { id: 'guardrail', label: '권한 경계' },
    { id: 'definition', label: '정의' },
    { id: 'workload', label: ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL },
    { id: 'findings', label: ANALYTICS_AREA_RECENT_FINDINGS_LABEL },
    { id: 'used-by', label: '사용 위치' },
  ];

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={() => {
          editingRef.current = false;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (editingRef.current) return;
          const detailButton = document.querySelector<HTMLButtonElement>(
            `[data-testid="aa-detail-${CSS.escape(area.slug)}"]`,
          );
          if (detailButton?.isConnected) detailButton.focus();
        }}
        side="right"
        className="flex w-[460px] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-testid="aa-slide-over"
      >
        <SheetTitle className="sr-only">{area.name}</SheetTitle>
        <SheetDescription className="sr-only">
          Analytics Area 상세 — analytics-area/{area.slug}
        </SheetDescription>
        <div className="flex items-center gap-2 border-b border-border-subtle px-6 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-accent-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            Analytics Area
          </span>
          <span className="font-mono text-xs text-text-muted">analytics-area/{area.slug}</span>
        </div>

        <DetailPanelSectionNav sections={sections} scrollRef={scrollRef} />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div data-anchor="overview">
            <PanelTitleBlock
              title={area.name}
              badges={
                <>
                  <ManagedSystemPill
                    name={ms?.name ?? area.managed_system_id}
                    {...(mark ? { mark: mark.color } : {})}
                  />
                  <OutlineBadge>필터 차원</OutlineBadge>
                </>
              }
            />
          </div>

          <div data-anchor="guardrail" className="px-4 py-3">
            <Callout tone="blue" icon={<Shield className="h-4 w-4" />} title="권한 경계가 아닙니다">
              Analytics Area는 권한 경계가 아니라 분류와 집계 단위입니다. Triage 필터, 대시보드 탭,
              Survey 대상 지정에만 사용되며 권한 확인에는 영향을 주지 않습니다.
            </Callout>
          </div>

          <div data-anchor="definition" className="px-4 py-3">
            <PanelSectionTitle>정의</PanelSectionTitle>
            <FieldRow label="Managed System" inset="none">
              <span className="flex items-center gap-1.5">
                {mark && <ManagedSystemMark label={mark.label} color={mark.color} size={18} />}
                <span>{ms?.name ?? area.managed_system_id}</span>
              </span>
            </FieldRow>
            <FieldRow label="슬러그" inset="none">
              <span className="font-mono text-xs">{area.slug}</span>
            </FieldRow>
            <FieldRow label="리드" inset="none">
              {lead ? (
                <UserChip user={{ display_name: lead }} size="sm" />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="생성일" inset="none">
              {created}
            </FieldRow>
            <FieldRow label="기본 공개 범위" inset="none">
              <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-secondary">
                <Shield className="h-2.5 w-2.5" />
                내부 · Managed System 범위
              </span>
            </FieldRow>
          </div>

          <div data-anchor="workload" className="px-4 py-3">
            <PanelSectionTitle>{ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL}</PanelSectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">활성 Finding</span>
                <span className="text-lg font-semibold text-text-primary">—</span>
                <span className="text-xs text-text-muted">이 Analytics Area 내</span>
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">Evidence 하이라이트</span>
                <span className="text-lg font-semibold text-text-primary">—</span>
                <span className="text-xs text-text-muted">이 Analytics Area에 연결됨</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-muted" data-testid="aa-workload-defer">
              Findings · Evidence 집계는 이후 화면이 제공되면 연결됩니다.
            </p>
          </div>

          <div data-anchor="findings" className="px-4 py-3">
            <PanelSectionTitle>{ANALYTICS_AREA_RECENT_FINDINGS_LABEL}</PanelSectionTitle>
            <div
              className="rounded-md border border-border-subtle bg-surface-card p-4 text-center text-xs text-text-muted"
              data-testid="aa-findings-defer"
            >
              Findings 목록은 이후 화면에서 연결됩니다.
            </div>
          </div>

          <div data-anchor="used-by" className="px-4 py-3">
            <PanelSectionTitle>사용 위치</PanelSectionTitle>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'VOC Triage', meta: '필터 차원' },
                { label: 'Findings 목록', meta: '필터 + 그룹화' },
                { label: 'Survey 대상 지정', meta: '세그먼트 정의' },
              ].map((u) => (
                <div
                  key={u.label}
                  className="flex items-center gap-2 rounded-md bg-surface-canvas px-2.5 py-2"
                >
                  <Layers className="h-3 w-3 text-text-muted" />
                  <span className="text-sm text-text-primary">{u.label}</span>
                  <span className="text-xs text-text-muted">· {u.meta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              editingRef.current = true;
              onEdit(area);
            }}
            data-testid="aa-edit-button"
          >
            <Settings className="h-3 w-3" />
            {GLOSSARY.edit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
