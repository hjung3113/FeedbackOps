import {
  Button,
  Callout,
  DetailPanelSectionNav,
  FieldRow,
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
  if (!area) return null;

  const mark = ms ? scopeMark(ms.slug, ms.name) : null;
  const lead = teamName(area, resolved);
  const created = area.created_at.slice(0, 10);

  // Workload + Findings are Slice 4/5 surfaces (not built). Shells render with
  // "—" placeholders; no counts available from the DTO (locked decision #88).
  const sections: PanelSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'guardrail', label: 'Guardrail' },
    { id: 'definition', label: 'Definition' },
    { id: 'workload', label: 'Workload' },
    { id: 'findings', label: 'Findings' },
    { id: 'used-by', label: 'Used by' },
  ];

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[460px] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-testid="aa-slide-over"
      >
        <SheetTitle className="sr-only">{area.name}</SheetTitle>
        <SheetDescription className="sr-only">
          Analytics Area detail — analytics-area/{area.slug}
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
                  <OutlineBadge>Filter dimension</OutlineBadge>
                </>
              }
            />
          </div>

          <div data-anchor="guardrail" className="px-4 py-3">
            <Callout
              tone="blue"
              icon={<Shield className="h-4 w-4" />}
              title="Not a permission boundary"
            >
              AA 는 권한 경계가 아닌 분류·집계 단위입니다. Triage filter, dashboard tab, survey
              targeting 같은 surface 에서만 사용되며 backend permission check 에는 영향을 주지
              않습니다.
            </Callout>
          </div>

          <div data-anchor="definition" className="px-4 py-3">
            <PanelSectionTitle>Definition</PanelSectionTitle>
            <FieldRow label="Managed System" className="px-0">
              <span className="flex items-center gap-1.5">
                {mark && (
                  <span
                    className="flex items-center justify-center rounded text-[10px] font-semibold text-white"
                    style={{ width: 18, height: 18, background: mark.color }}
                    aria-hidden="true"
                  >
                    {mark.label}
                  </span>
                )}
                <span>{ms?.name ?? area.managed_system_id}</span>
              </span>
            </FieldRow>
            <FieldRow label="Slug" className="px-0">
              <span className="font-mono text-xs">{area.slug}</span>
            </FieldRow>
            <FieldRow label="Lead" className="px-0">
              {lead ? (
                <UserChip user={{ display_name: lead }} size="sm" />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Created" className="px-0">
              {created}
            </FieldRow>
            <FieldRow label="Default visibility" className="px-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-secondary">
                <Shield className="h-2.5 w-2.5" />
                Internal · MS-scoped
              </span>
            </FieldRow>
          </div>

          <div data-anchor="workload" className="px-4 py-3">
            <PanelSectionTitle>Workload signal</PanelSectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">Active findings</span>
                <span className="text-lg font-semibold text-text-primary">—</span>
                <span className="text-xs text-text-muted">in this analytics area</span>
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">Evidence highlights</span>
                <span className="text-lg font-semibold text-text-primary">—</span>
                <span className="text-xs text-text-muted">tagged to this AA</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-muted" data-testid="aa-workload-defer">
              Findings · Evidence 집계는 Slice 4/5 surface 가 들어온 뒤 연결됩니다.
            </p>
          </div>

          <div data-anchor="findings" className="px-4 py-3">
            <PanelSectionTitle>Recent findings</PanelSectionTitle>
            <div
              className="rounded-md border border-border-subtle bg-surface-card p-4 text-center text-xs text-text-muted"
              data-testid="aa-findings-defer"
            >
              Findings 목록은 Slice 4/5 에서 연결됩니다.
            </div>
          </div>

          <div data-anchor="used-by" className="px-4 py-3">
            <PanelSectionTitle>Used by</PanelSectionTitle>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'VOC Triage', meta: 'filter dimension' },
                { label: 'Findings list', meta: 'filter + grouping' },
                { label: 'Survey targeting', meta: 'segment definition' },
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
            onClick={() => onEdit(area)}
            data-testid="aa-edit-button"
          >
            <Settings className="h-3 w-3" />
            Edit area
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
