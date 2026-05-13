import { richContentHasUnsafeInlineImage } from "@feedbackops/shared";
import type { ReactNode } from "react";
import { Badge, Button } from "./primitives";

export interface ObjectListItem {
  id: string;
  title: string;
  meta?: string;
  signal?: string;
}

export function ObjectList({
  items,
  selectedId,
  onSelect
}: {
  items: ObjectListItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="fo-empty">No records</div>;
  }
  return (
    <div className="fo-object-list" role="list">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            className="fo-list-row"
            aria-current={selected ? "true" : undefined}
            data-selected={selected ? "true" : "false"}
            onClick={() => onSelect(item.id)}
          >
            <span className="fo-list-title">{item.title}</span>
            {item.meta ? <span className="fo-list-meta">{item.meta}</span> : null}
            {item.signal ? <span className="fo-list-signal">{item.signal}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function DetailPanel({
  title,
  children,
  permissionBlocked = false,
  summary
}: {
  title: string;
  children: ReactNode;
  permissionBlocked?: boolean;
  summary?: string;
}) {
  return (
    <aside className="fo-detail-panel" aria-label={title}>
      <header className="fo-panel-header">
        <h2>{title}</h2>
      </header>
      {permissionBlocked ? (
        <div className="fo-permission-blocked">
          <p>{summary ?? "You can view a limited summary for this record."}</p>
          <Button>Request access</Button>
        </div>
      ) : (
        <div className="fo-panel-body">{children}</div>
      )}
    </aside>
  );
}

export function StatusBadge({ family, value }: { family: "reporter-voc" | "task" | "task-request" | "finding"; value: string }) {
  return (
    <Badge tone={family === "reporter-voc" ? "default" : "muted"}>
      <span className="fo-status-badge" data-family={family}>
        {value}
      </span>
    </Badge>
  );
}

export function SignalBadge({ value, urgent = false }: { value: string; urgent?: boolean }) {
  return <Badge tone={urgent ? "urgent" : "muted"}>{value}</Badge>;
}

export function PermissionBlockedPanel({ summary }: { summary: string }) {
  return (
    <div className="fo-permission-blocked">
      <p>{summary}</p>
      <Button>Request access</Button>
    </div>
  );
}

export function ActionQueueRow({ title, reason, nextAction }: { title: string; reason: string; nextAction: string }) {
  return (
    <div className="fo-action-row">
      <div>
        <strong>{title}</strong>
        <p>{reason}</p>
      </div>
      <Button variant="primary">{nextAction}</Button>
    </div>
  );
}

export function LinkedEntityTrail({ links }: { links: string[] }) {
  return (
    <ol className="fo-linked-trail" aria-label="Linked entity trail">
      {links.map((link) => (
        <li key={link}>{link}</li>
      ))}
    </ol>
  );
}

export function EvidenceHighlight({ children }: { children: ReactNode }) {
  return <blockquote className="fo-evidence">{children}</blockquote>;
}

export function validateRichContent(value: string): { ok: true } | { ok: false; reason: string } {
  if (richContentHasUnsafeInlineImage(value)) {
    return { ok: false, reason: "Inline images must use attachment references." };
  }
  return { ok: true };
}

export function RichContentEditor({
  label,
  value,
  onChange,
  error
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <label className="fo-rich-editor">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
      />
      {error ? <span className="fo-field-error">{error}</span> : null}
    </label>
  );
}
