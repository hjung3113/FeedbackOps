// ============================================================
// FeedbackOps — Entity nodes, trails, icon badges, relation rows
// ============================================================

// ============================================================
// Linked Entity Trail
// ============================================================
function EntityNode({ type, title, meta, placeholder, action, selected, onClick }) {
  const typeMap = {
    voc: { label: 'V', color: '#5e6ad2' },
    evidence: { label: 'E', color: '#02b8cc' },
    finding: { label: 'F', color: '#e4f222', text: '#08090a' },
    request: { label: 'R', color: '#f2c46d', text: '#08090a' },
    task: { label: 'T', color: '#27a644' },
    survey: { label: 'S', color: '#8b5cf6' },
    outcome: { label: 'O', color: '#8b5cf6' },
  };
  const t = typeMap[type] || { label: '?', color: 'var(--color-charcoal-grey)' };
  return (
    <div
      className={`entity-node ${placeholder ? 'placeholder-node' : ''} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      } : undefined}
      style={onClick ? {
        cursor: 'pointer',
        boxShadow: selected ? 'inset 0 0 0 1px var(--border-selected)' : undefined,
      } : undefined}>
      <div className="entity-node-icon" style={!placeholder ? { background: t.color, color: t.text || 'white' } : {}}>
        {t.label}
      </div>
      <div className="entity-node-body">
        <div className="entity-node-title">{title}</div>
        {meta && <div className="entity-node-meta">{meta}</div>}
      </div>
      {action && <span className="badge" style={{ background: 'transparent' }}>{action}</span>}
    </div>
  );
}

function LinkedEntityTrail({ nodes, selectedKey, onNodeClick }) {
  return (
    <div className="entity-trail">
      {nodes.map((n, i) => (
        <div key={n.key || i}>
          {i > 0 && <div className="entity-trail-connector" />}
          <EntityNode
            {...n}
            selected={selectedKey === (n.key || `${n.type}-${i}`)}
            onClick={onNodeClick && (n.placeholder || n.action) ? () => onNodeClick(n, i) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// EntityIconBadge — colored letter icon (V/F/T/R/E/S/O)
// Used in entity-trail, recent-links, sample VOCs (3+ uses)
// ============================================================
const ENTITY_ICON_MAP = {
  voc:      { letter: 'V', bg: '#5e6ad2', color: 'white' },
  evidence: { letter: 'E', bg: '#02b8cc', color: 'white' },
  finding:  { letter: 'F', bg: '#e4f222', color: '#08090a' },
  request:  { letter: 'R', bg: '#f2c46d', color: '#08090a' },
  task:     { letter: 'T', bg: '#27a644', color: 'white' },
  survey:   { letter: 'S', bg: '#8b5cf6', color: 'white' },
  outcome:  { letter: 'O', bg: '#8b5cf6', color: 'white' },
};

function EntityIconBadge({ type, size = 22 }) {
  const e = ENTITY_ICON_MAP[type] || { letter: '?', bg: 'var(--color-charcoal-grey)', color: 'white' };
  return (
    <span className="entity-node-icon" style={{
      width: size, height: size,
      fontSize: Math.max(8, Math.round(size * 0.45)),
      background: e.bg, color: e.color,
      borderRadius: size <= 18 ? 4 : 6,
    }}>
      {e.letter}
    </span>
  );
}

// ============================================================
// SourceTypeIcon — colored letter icon for evidence-style source refs
// (V/S/N).  Promoted from screen-evidence.jsx in Pack 10 so the
// Milestone Detail's Evidence section, Cluster member rows, and
// Survey Result evidence excerpts can all consume the same atom.
// ============================================================
const SOURCE_TYPE_META = {
  voc:             { letter: 'V', bg: '#5e6ad2', color: 'white',                    label: 'VOC' },
  survey_response: { letter: 'S', bg: '#8b5cf6', color: 'white',                    label: 'Survey' },
  note:            { letter: 'N', bg: 'var(--color-charcoal-grey)', color: 'var(--text-secondary)', label: 'Note' },
};

function SourceTypeIcon({ type, size = 22 }) {
  const m = SOURCE_TYPE_META[type] || SOURCE_TYPE_META.note;
  return (
    <span className="entity-node-icon" style={{
      width: size, height: size,
      fontSize: Math.max(8, Math.round(size * 0.45)),
      background: m.bg, color: m.color,
      borderRadius: size <= 18 ? 4 : 6,
    }}>{m.letter}</span>
  );
}

// ============================================================
// EntityRelationRow — generalised from EntityLinkRow + the cluster
// "sample VOC" entity-node pattern.  Two shapes:
//   1) single entity   — left only           (Cluster member row)
//   2) source → target — left + arrow + right (Entity link row)
// Both shapes share icon + id + title + meta + optional trailing badge.
// Pack 10 extraction (HANDOFF §11).
// ============================================================
function EntityRelationRow({
  left, right, relation,
  title, meta,
  trailing, leading,
  selected, onClick,
  compact = false,
  style,
}) {
  const stem = right ? (
    // Two-endpoint shape — source → relation → target
    <div className="hstack" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
      <span className="hstack" style={{ gap: 6 }}>
        <EntityIconBadge type={left.type} size={compact ? 18 : 22} />
        <span className="mono text-sm">{left.id}</span>
      </span>
      <Icon name="arrowRight" size={11} className="muted" />
      <span className="hstack" style={{ gap: 6 }}>
        <EntityIconBadge type={right.type} size={compact ? 18 : 22} />
        <span className="mono text-sm">{right.id}</span>
      </span>
      {relation && <OutlineBadge>{relation}</OutlineBadge>}
    </div>
  ) : (
    // Single-entity shape — icon + title/meta block
    <div className="hstack" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
      <EntityIconBadge type={left.type} size={compact ? 18 : 22} />
      <div className="vstack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
        <div className="text-sm" style={{
          fontWeight: 500, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title || left.id}
        </div>
        {meta && <div className="text-xs muted">{meta}</div>}
      </div>
    </div>
  );

  // Clickable variant — flex layout (don't use .entity-node since it
  // imposes a fixed 18px×1fr×auto grid that crams a multi-element stem
  // into a tiny first column).  Replicates the entity-node visual
  // (padding, hover, dashed-placeholder rules) inline.
  return (
    <div
      className={selected ? 'selected' : ''}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-subtle)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 120ms',
        ...(selected ? { boxShadow: 'inset 0 0 0 1px var(--border-selected)' } : {}),
        ...style,
      }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>{stem}</div>
      {trailing && <div className="hstack" style={{ gap: 6, flexShrink: 0 }}>{trailing}</div>}
    </div>
  );
}

// ============================================================
// ObjectCard — generic structured card with id chip + title + status
// + meta line + footer.  Originally the Milestone card pattern; in
// Pack 10 it's exposed so other object types (Findings card view,
// Surveys card view, future grouped lists) get the same rhythm.
// Slots are deliberately minimal — extra content goes in `children`
// between the metadata strip and the footer.
// ============================================================
function ObjectCard({
  id, title, status, statusTone,
  badges, meta, footer, leading, trailing,
  onClick, selected, compact = false, children, style,
}) {
  return (
    <div
      onClick={onClick}
      className={selected ? 'selected' : ''}
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        boxShadow: selected
          ? 'inset 0 0 0 1px var(--border-selected)'
          : 'var(--shadow-subtle)',
        padding: compact ? 12 : 14,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10,
        ...style,
      }}>
      <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
        {leading}
        <div className="vstack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {id && <span className="row-id">{id}</span>}
            <span style={{
              fontWeight: 600, fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
            }}>{title}</span>
            {status}
          </div>
          {badges && <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>{badges}</div>}
        </div>
        {trailing}
      </div>
      {meta && (
        <div className="row-meta" style={{ gap: 8, flexWrap: 'wrap' }}>{meta}</div>
      )}
      {children}
      {footer && (
        <div className="hstack" style={{
          gap: 6, paddingTop: 8,
          borderTop: '1px solid var(--border-subtle)',
        }}>{footer}</div>
      )}
    </div>
  );
}

// Expose
Object.assign(window, {
  EntityNode, LinkedEntityTrail,
  ENTITY_ICON_MAP, EntityIconBadge,
  SOURCE_TYPE_META, SourceTypeIcon,
  EntityRelationRow, ObjectCard,
});
