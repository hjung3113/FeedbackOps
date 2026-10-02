import { shortId } from '@/lib/identity';
import type { TaskRequestDto } from '@fops/shared';
import {
  FieldRow,
  ManagedSystemPill,
  PanelSectionTitle,
  UnassignedBadge,
  UserChip,
} from '@fops/ui';

import type { NameMaps } from './TaskRequestRow';

export function TaskRequestPropertiesSection({
  item,
  names,
  reviewer,
}: {
  item: TaskRequestDto;
  names: NameMaps;
  reviewer: NameMaps['actorsById'][string] | undefined;
}) {
  return (
    <section data-anchor="properties" className="border-t border-border-subtle px-4 py-4">
      <PanelSectionTitle>속성</PanelSectionTitle>
      <FieldRow label="Managed System">
        <span className="flex flex-col gap-1">
          <ManagedSystemPill
            name={
              names.managedSystemsById[item.primary_managed_system_id]?.name ?? 'Managed System'
            }
          />
          {!names.managedSystemsById[item.primary_managed_system_id] && (
            <span className="font-mono text-xs text-text-muted">
              {shortId(item.primary_managed_system_id)}
            </span>
          )}
        </span>
      </FieldRow>
      <FieldRow label="검토자">
        {reviewer ? (
          <UserChip
            user={{ display_name: reviewer.display_name }}
            {...(reviewer.email !== undefined ? { sub: reviewer.email } : {})}
          />
        ) : (
          <UnassignedBadge label="검토자 없음" />
        )}
      </FieldRow>
      <FieldRow label="본인 승인">
        <span className="rounded border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
          범위 내 권한 필요
        </span>
      </FieldRow>
    </section>
  );
}
