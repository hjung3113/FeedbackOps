// ============================================================
// FeedbackOps — Page and list/workbench shells
// ============================================================

// ============================================================
// PageShell — unified content layout for non-list pages
// (Home, Integration, Surveys, Admin, Create VOC ...)
// ============================================================
function PageShell({ title, subtitle, eyebrow, actions, back, children, fluid = false }) {
  return (
    <div className={`main-scroll page-shell ${fluid ? 'page-shell--fluid' : 'page-shell--constrained'}`}>
      <div className={`main-padded ${fluid ? '' : 'constrained'}`}>
        {(title || actions || back) && (
          <div className="page-header hstack">
            <div className="page-header-copy vstack">
              {(eyebrow || back) && (
                <div className="page-kicker hstack">
                  {back}
                  {eyebrow}
                </div>
              )}
              {title && <h1 className="page-title">{title}</h1>}
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="page-actions hstack">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function PageShellBackButton({ children, onClick, variant = 'subtle' }) {
  return (
    <Button variant={variant} size="sm" icon="chevronLeft" onClick={onClick}>
      {children}
    </Button>
  );
}

// ============================================================
// ListToolbar — tabs + flexible right slot (6+ uses)
// ============================================================
function ListToolbar({ tabs, activeTab, onTabChange, action, children }) {
  // `action` renders pinned to the right edge (position: sticky) so the
  // primary CTA stays clickable even when the toolbar overflows because
  // the detail panel is open. Falls back to plain `children` slot when
  // a caller doesn't separate primary action from secondary controls.
  return (
    <div className="toolbar">
      {tabs && (
        <div className="tabs">
          {tabs.map(t => (
            <button key={t.key}
              className={`tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => onTabChange && onTabChange(t.key)}
              title={t.tip}>
              {t.icon && <Icon name={t.icon} size={12} />}
              {t.label}
              {t.count != null && <span className={`tab-count ${t.urgent ? 'urgent' : ''}`}>{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="toolbar-spacer" />
      {children}
      {action && <div className="toolbar-action">{action}</div>}
    </div>
  );
}

function ListShell({ toolbar, beforeList, afterList, children, detail, scrollClassName = '', scrollStyle }) {
  return (
    <>
      <div className="main-region list-shell">
        {toolbar}
        {beforeList}
        <div className={`main-scroll list-shell-scroll ${scrollClassName}`} style={{ padding: 0, ...scrollStyle }}>
          {children}
        </div>
        {afterList}
      </div>
      {detail}
    </>
  );
}

function WorkbenchShell({ toolbar, belowToolbar, children, detail, bodyClassName = '', bodyStyle }) {
  return (
    <>
      <div className="main-region workbench-shell">
        {toolbar && <div className="workbench-toolbar">{toolbar}</div>}
        {belowToolbar}
        <div className={`workbench-body ${bodyClassName}`} style={bodyStyle}>
          {children}
        </div>
      </div>
      {detail}
    </>
  );
}

function ShellTitle({ icon, title, iconColor, children }) {
  return (
    <div className="shell-title">
      {icon && <Icon name={icon} size={14} style={{ color: iconColor || 'var(--text-muted)' }} />}
      <span className="shell-title-text">{title}</span>
      {children}
    </div>
  );
}

// Expose
Object.assign(window, {
  PageShell, PageShellBackButton, ListToolbar, ListShell, WorkbenchShell, ShellTitle,
});
