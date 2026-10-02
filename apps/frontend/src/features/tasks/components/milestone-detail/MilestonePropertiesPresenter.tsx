import { GLOSSARY } from '@/lib/copy/glossary';
import { formatDate, formatDateOnly } from '@/lib/format/datetime';
import type { MilestoneDetailDto } from '@fops/shared';
import { FieldRow, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fops/ui';

import {
  MilestoneManagedSystemPill,
  MilestoneOutlineBadge,
  MilestoneOwnerChip,
  MilestonePanelSectionTitle,
} from '../MilestoneIdentity';
import { STATUS_OPTIONS, milestonePropertyFieldClassName, selectClassName } from './constants';
import type { UseMilestoneStatusEditResult } from './useMilestoneStatusEdit';
import type { UseMilestoneTitleEditResult } from './useMilestoneTitleEdit';

export function MilestonePropertiesPresenter({
  milestone,
  managedSystemName,
  areaName,
  ownerName,
  titleEdit,
  statusEdit,
}: {
  milestone: MilestoneDetailDto;
  managedSystemName: string;
  areaName: string | undefined;
  ownerName: string | undefined;
  titleEdit: UseMilestoneTitleEditResult;
  statusEdit: UseMilestoneStatusEditResult;
}) {
  const { titleMutation } = titleEdit;
  const { statusError, statusMutation, handleStatusChange } = statusEdit;

  return (
    <div className="mb-8">
      <MilestonePanelSectionTitle>속성</MilestonePanelSectionTitle>
      {/* The scroll container owns horizontal padding. These local rows use the prototype's 120px value column and left alignment. */}
      <FieldRow label="상태" className={milestonePropertyFieldClassName}>
        {/* The accepted status set stays closed; the title-block badge above stays read-only. */}
        <span className="flex items-center justify-end gap-2">
          <Select
            value={milestone.status}
            disabled={statusMutation.isPending || titleMutation.isPending}
            onValueChange={(value) => handleStatusChange(value, titleMutation.isPending)}
          >
            <SelectTrigger
              aria-label="상태"
              value={milestone.status}
              className={`${selectClassName} h-8 px-2 py-1`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusError !== null && (
            <span className="text-sm text-accent-danger">{statusError}</span>
          )}
        </span>
      </FieldRow>
      {/* Managed System is create-only (A3/A8): read-only text, never an input. */}
      <FieldRow label="Managed System" className={milestonePropertyFieldClassName}>
        <MilestoneManagedSystemPill name={managedSystemName} />
      </FieldRow>
      <FieldRow label="Analytics Area" className={milestonePropertyFieldClassName}>
        {areaName !== undefined ? (
          <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </FieldRow>
      {/* Missing owner lookup keeps the explicit em dash fallback. */}
      <FieldRow label={GLOSSARY.owner} className={milestonePropertyFieldClassName}>
        {ownerName !== undefined ? (
          <MilestoneOwnerChip name={ownerName} />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </FieldRow>
      <FieldRow label={GLOSSARY.start} className={milestonePropertyFieldClassName}>
        <span className="font-mono text-xs text-text-secondary">
          {formatDateOnly(milestone.start_date)}
        </span>
      </FieldRow>
      <FieldRow label={GLOSSARY.target} className={milestonePropertyFieldClassName}>
        <span className="font-mono text-xs text-text-secondary">
          {formatDateOnly(milestone.target_date)}
        </span>
      </FieldRow>
      <FieldRow label="생성일" className={milestonePropertyFieldClassName}>
        {formatDate(milestone.created_at)}
      </FieldRow>
    </div>
  );
}
