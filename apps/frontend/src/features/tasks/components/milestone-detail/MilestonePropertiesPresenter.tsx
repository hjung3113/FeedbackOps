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
import { STATUS_OPTIONS } from './constants';
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
      <FieldRow label="상태" layout="property">
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
              density="compact"
              className={
                // oxlint-disable-next-line shadcn/no-restyle -- the milestone status picker uses the detail surface and a 4px radius in the property column
                'w-48 rounded bg-surface-detail'
              }
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
      <FieldRow label="Managed System" layout="property">
        <MilestoneManagedSystemPill name={managedSystemName} />
      </FieldRow>
      <FieldRow label="Analytics Area" layout="property">
        {areaName !== undefined ? (
          <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </FieldRow>
      {/* Missing owner lookup keeps the explicit em dash fallback. */}
      <FieldRow label={GLOSSARY.owner} layout="property">
        {ownerName !== undefined ? (
          <MilestoneOwnerChip name={ownerName} />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </FieldRow>
      <FieldRow label={GLOSSARY.start} layout="property">
        <span className="font-mono text-xs text-text-secondary">
          {formatDateOnly(milestone.start_date)}
        </span>
      </FieldRow>
      <FieldRow label={GLOSSARY.target} layout="property">
        <span className="font-mono text-xs text-text-secondary">
          {formatDateOnly(milestone.target_date)}
        </span>
      </FieldRow>
      <FieldRow label="생성일" layout="property">
        {formatDate(milestone.created_at)}
      </FieldRow>
    </div>
  );
}
