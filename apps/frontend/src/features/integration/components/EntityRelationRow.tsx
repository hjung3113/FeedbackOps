import type { EntityLinkDto } from "@fops/shared";
import type * as React from "react";
import {
  EntityIconBadge,
  cn,
  ReporterStatusBadge,
  type EntityIconType,
  type ReporterFacingStatusEnum,
} from "@fops/ui";
import { ArrowRight, Lock } from "lucide-react";

type AllowedEntityLinkDto = Extract<
  EntityLinkDto,
  { visibility_state: "allowed" }
>;

function shortId(id: string): string {
  return id.slice(0, 8);
}

function targetDisplayId(link: AllowedEntityLinkDto): string {
  if (
    link.visibility_state === "allowed" &&
    link.target_summary?.id === link.target_id &&
    link.target_summary.type === link.target_type
  ) {
    return link.target_summary.display_id;
  }
  return shortId(link.target_id);
}

function iconTypeFor(type: EntityLinkDto["source_type"]): EntityIconType {
  if (type === "task_request") return "request";
  if (type === "voc_cluster") return "voc";
  return type;
}

export function EntityRelationRow({
  link,
  compact = false,
  member,
}: {
  link?: EntityLinkDto;
  compact?: boolean;
  member?: {
    vocId: string;
    displayId?: string | null;
    title?: React.ReactNode;
    severity?: string | null;
    reporterStatus?: ReporterFacingStatusEnum | null;
    trailing?: React.ReactNode;
  };
}) {
  if (member) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm text-text-primary">
            {member.title || member.displayId || "VOC"}
          </div>
          <p className="text-xs text-text-muted">
            {member.displayId ?? shortId(member.vocId)}
            {member.severity ? ` · ${member.severity}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {member.reporterStatus && (
            <ReporterStatusBadge status={member.reporterStatus} />
          )}
          {member.trailing}
        </div>
      </div>
    );
  }
  if (!link) return null;
  if (link.visibility_state !== "allowed") {
    return (
      <div className="inline-flex min-w-0 items-center gap-2 bg-transparent">
        <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-blocked px-2 py-0.5 text-xs font-medium text-text-muted">
          <Lock className="h-3 w-3" aria-hidden="true" />
          권한 제한
        </span>
        <span className="font-mono text-xs text-text-muted">
          {link.relation_type}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center gap-2 bg-transparent",
        compact && "gap-1.5",
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <EntityIconBadge type={iconTypeFor(link.source_type)} size={18} />
        <span className="font-mono text-xs text-text-primary">
          {shortId(link.source_id)}
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
        {link.relation_type}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <EntityIconBadge type={iconTypeFor(link.target_type)} size={18} />
        <span className="font-mono text-xs text-text-primary">
          {targetDisplayId(link)}
        </span>
      </span>
    </div>
  );
}
