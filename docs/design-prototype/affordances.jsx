// ============================================================
// FeedbackOps — Shared interaction affordances (Pack 12)
// ============================================================
// Wires up the "small but visible" UX primitives that previous packs
// stubbed out as inert buttons:
//   - Toast host + window.__toast() global emitter
//   - useFullscreenPanel hook (expand icon → app-shell.panel-fullscreen)
//   - Popover primitive (click-outside dismiss, esc close)
//   - ListFilterButton / ListSortButton (toolbar popovers)
//   - DetailPanelHeaderActions (link / expand / more, fully wired)
//   - PreviewModal (composer "Preview" button)
//
// All primitives expose themselves on `window` so screen-*.jsx can pick
// them up without ESM imports (matches the rest of the prototype).
// ============================================================

// ------------------------------------------------------------
// Toast host
// ------------------------------------------------------------
function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const handler = (e) => {
      const id = Math.random().toString(36).slice(2, 9);
      const toast = { id, ...(e.detail || {}) };
      setToasts(prev => [...prev, toast]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), toast.duration || 2800);
    };
    window.addEventListener('__feedbackops_toast', handler);
    return () => window.removeEventListener('__feedbackops_toast', handler);
  }, []);
  // Expose a tiny emitter so any screen / primitive can call:
  //   window.__toast({ message: 'Copied', tone: 'success' })
  useEffect(() => {
    window.__toast = (detail) => window.dispatchEvent(new CustomEvent('__feedbackops_toast', { detail }));
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host">
      {toasts.map(t => (
        <div key={t.id} className={`toast tone-${t.tone || 'default'}`}
          onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
          {t.tone === 'success' && <Icon name="check" size={12} style={{ color: 'var(--color-emerald)' }} />}
          {t.tone === 'warn'    && <Icon name="alert" size={12} style={{ color: 'var(--color-amber)' }} />}
          {t.tone === 'danger'  && <Icon name="alert" size={12} style={{ color: 'var(--color-warning-red)' }} />}
          <span>{t.message}</span>
          {t.action && (
            <button className="btn btn-ghost btn-sm"
              onClick={(e) => { e.stopPropagation(); t.action.onClick?.(); }}
              style={{ marginLeft: 8 }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Fullscreen panel hook
// ------------------------------------------------------------
function useFullscreenPanel() {
  const [fs, setFs] = useState(() =>
    typeof document !== 'undefined' &&
    document.querySelector('.app-shell')?.classList.contains('panel-fullscreen') || false
  );
  const toggle = useCallback(() => {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    shell.classList.toggle('panel-fullscreen');
    const open = shell.classList.contains('panel-fullscreen');
    window.dispatchEvent(new CustomEvent('__panel-fullscreen-changed', { detail: open }));
  }, []);
  useEffect(() => {
    const handler = (e) => setFs(!!e.detail);
    window.addEventListener('__panel-fullscreen-changed', handler);
    return () => window.removeEventListener('__panel-fullscreen-changed', handler);
  }, []);
  // Exiting fullscreen on Esc.
  useEffect(() => {
    if (!fs) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.querySelector('.app-shell')?.classList.remove('panel-fullscreen');
        window.dispatchEvent(new CustomEvent('__panel-fullscreen-changed', { detail: false }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fs]);
  return [fs, toggle];
}

// ------------------------------------------------------------
// Popover — anchored to an element by ref.
// ------------------------------------------------------------
function Popover({ open, anchorRef, onClose, align = 'left', children, width, offset = 6 }) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const top = r.bottom + offset;
      const left = align === 'right' ? r.right : r.left;
      setPos({ top, left, align });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, align, offset]);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      if (anchorRef.current && anchorRef.current.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);
  if (!open || !pos) return null;
  const style = {
    top: pos.top,
    width,
    ...(align === 'right' ? { right: window.innerWidth - pos.left } : { left: pos.left }),
  };
  return (
    <div ref={popoverRef} className="popover" style={style}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------
// ListFilterButton — generic multi-category filter popover.
//   categories: [{ key, label, options: [{ value, label, count? }] }]
//   applied:    { [categoryKey]: Set<value> }
//   onChange:   (categoryKey, value, checked) => void
//   onClear:    () => void
// ------------------------------------------------------------
function ListFilterButton({ categories, applied, onChange, onClear, label = 'Filter' }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const totalApplied = Object.values(applied || {}).reduce((acc, s) => acc + (s?.size || 0), 0);
  return (
    <>
      <button ref={anchorRef}
        className={`btn btn-${totalApplied > 0 ? 'secondary' : 'subtle'} btn-sm`}
        onClick={() => setOpen(o => !o)}>
        <Icon name="filter" size={12} />
        {label}
        {totalApplied > 0 && (
          <span className="badge" style={{
            background: 'var(--color-neon-lime)', color: 'var(--color-pitch-black)',
            fontSize: 10, padding: '0 6px', borderRadius: 9999, marginLeft: 4,
          }}>{totalApplied}</span>
        )}
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} width={260}>
        {categories.map((cat, i) => (
          <div key={cat.key}>
            {i > 0 && <div className="popover-divider" />}
            <div className="popover-section-title">{cat.label}</div>
            {cat.options.map(opt => {
              const set = applied?.[cat.key];
              const checked = set?.has(opt.value);
              return (
                <div key={opt.value} className="popover-item"
                  onClick={() => onChange?.(cat.key, opt.value, !checked)}>
                  <span className={`check-box ${checked ? 'checked' : ''}`}>
                    {checked && <Icon name="check" size={9} stroke={3} />}
                  </span>
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {opt.count != null && <span className="text-xs muted">{opt.count}</span>}
                </div>
              );
            })}
          </div>
        ))}
        {totalApplied > 0 && (
          <>
            <div className="popover-divider" />
            <div className="popover-item" style={{ color: 'var(--text-muted)' }}
              onClick={() => { onClear?.(); setOpen(false); }}>
              <Icon name="close" size={10} />
              <span>모든 필터 해제</span>
            </div>
          </>
        )}
      </Popover>
    </>
  );
}

// ------------------------------------------------------------
// ListSortButton — single-select sort.
//   fields:    [{ key, label }]
//   value:     'field' or 'field:desc'
//   onChange:  (next) => void
// ------------------------------------------------------------
function ListSortButton({ fields, value, onChange, label = 'Sort', icon = 'sort' }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const [field, dir] = (value || '').split(':');
  const current = fields.find(f => f.key === field);
  return (
    <>
      <button ref={anchorRef}
        className={`btn btn-${current ? 'secondary' : 'subtle'} btn-sm`}
        onClick={() => setOpen(o => !o)}>
        <Icon name={icon} size={12} />
        {label}{current ? `: ${current.label}` : ''}
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} width={220}>
        <div className="popover-section-title">{label}</div>
        {fields.map(f => {
          const checked = f.key === field;
          return (
            <div key={f.key} className="popover-item"
              onClick={() => { onChange?.(`${f.key}:${dir || 'asc'}`); setOpen(false); }}>
              <span className={`radio-dot ${checked ? 'checked' : ''}`} />
              <span style={{ flex: 1 }}>{f.label}</span>
            </div>
          );
        })}
        {field && (
          <>
            <div className="popover-divider" />
            <div className="popover-item"
              onClick={() => { onChange?.(`${field}:${dir === 'desc' ? 'asc' : 'desc'}`); }}>
              <Icon name={dir === 'desc' ? 'arrowRight' : 'arrowUpRight'} size={10}
                style={{ transform: dir === 'desc' ? 'rotate(90deg)' : 'rotate(-45deg)' }} />
              <span style={{ flex: 1 }}>{dir === 'desc' ? '오름차순' : '내림차순'}</span>
            </div>
          </>
        )}
      </Popover>
    </>
  );
}

// ------------------------------------------------------------
// MoreButton — generic kebab dropdown.
//   items: [{ key, label, icon, tone, onClick, divider }]
// ------------------------------------------------------------
function MoreButton({ items, icon = 'more', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  return (
    <>
      <button ref={anchorRef} className="btn btn-ghost btn-sm"
        onClick={() => setOpen(o => !o)}
        aria-label="More">
        <Icon name={icon} size={14} />
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} width={220} align={align}>
        {items.map((item, i) => item.divider ? (
          <div key={item.key || `div-${i}`} className="popover-divider" />
        ) : (
          <div key={item.key || `item-${i}`} className="popover-item"
            style={{ color: item.tone === 'danger' ? 'var(--color-warning-red)' : undefined }}
            onClick={() => { setOpen(false); item.onClick?.(); }}>
            {item.icon && <Icon name={item.icon} size={11} />}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.kbd && <span className="kbd">{item.kbd}</span>}
          </div>
        ))}
      </Popover>
    </>
  );
}

// ------------------------------------------------------------
// DetailPanelHeaderActions — drop-in replacement for the ad-hoc icon
// row in every detail panel header. Wires copy-link / expand / more.
//
//   kind        — entity-kind label for toast copy ("VOC", "Finding", ...)
//   onClose     — passed to <DetailPanelHeader> separately
//   moreItems   — optional override; falls back to a sensible default
//                  (Copy summary, Open in new tab, Archive)
// ------------------------------------------------------------
function DetailPanelHeaderActions({ entityKind = '항목', entityId, copyHash, extraMore }) {
  const [isFullscreen, toggleFullscreen] = useFullscreenPanel();
  const getShareUrl = () => {
    const hash = copyHash || window.location.hash || '';
    try {
      if (
        window.location.protocol === 'about:' ||
        window.location.origin === 'null' ||
        window.location.href === 'about:srcdoc'
      ) {
        return hash || entityId || '';
      }
      return `${window.location.origin}${window.location.pathname}${hash}`;
    } catch (error) {
      return hash || entityId || '';
    }
  };

  const handleCopyLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      window.__toast({ message: `${entityKind} 링크가 복사되었습니다`, tone: 'success' });
    } catch (e) {
      window.prompt('이 링크를 복사하세요:', url);
    }
  };

  const defaultMore = [
    { key: 'copy-id', label: `${entityId} 식별자 복사`, icon: 'copy', onClick: () => {
      navigator.clipboard?.writeText(entityId);
      window.__toast({ message: `${entityId} 복사됨`, tone: 'success' });
    } },
    { key: 'open-new', label: '새 탭에서 열기', icon: 'arrowUpRight', onClick: () => {
      const url = getShareUrl();
      if (!url.startsWith('#')) window.open(url, '_blank');
      else window.__toast({ message: '미리보기 안에서는 새 탭 링크 대신 복사를 사용하세요', tone: 'default' });
    } },
    { key: 'div-1', divider: true },
    { key: 'subscribe', label: '알림 구독', icon: 'bell', onClick: () => {
      window.__toast({ message: `${entityId} 알림 구독 (mock)`, tone: 'default' });
    } },
    { key: 'snooze', label: '내일까지 보류', icon: 'shield', onClick: () => {
      window.__toast({ message: `${entityId} 내일 09:00 까지 보류됨 (mock)`, tone: 'default' });
    } },
    { key: 'div-2', divider: true },
    { key: 'archive', label: '아카이브', icon: 'inbox', tone: 'danger', onClick: () => {
      window.__toast({ message: `${entityId} 아카이브됨 (mock)`, tone: 'warn' });
    } },
    ...(extraMore || []),
  ];

  return (
    <>
      <Button variant="ghost" size="sm" icon="link" onClick={handleCopyLink} title="링크 복사" />
      <Button variant="ghost" size="sm"
        icon={isFullscreen ? 'collapse' : 'expand'}
        onClick={toggleFullscreen}
        title={isFullscreen ? '드로어로 보기' : '전체화면으로 보기'} />
      <MoreButton items={defaultMore} />
    </>
  );
}

// ------------------------------------------------------------
// PreviewModal — dimmed-backdrop modal used by the composer "Preview"
// button and any other "show me the published render" affordance.
// ------------------------------------------------------------
function PreviewModal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: 'rgba(8,9,10,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface-popover)',
        border: '1px solid var(--border-strong)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-xl)',
        width: 'min(560px, 100%)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="hstack" style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          alignItems: 'center', gap: 8,
        }}>
          <Icon name="megaphone" size={12} style={{ color: 'var(--color-neon-lime)' }} />
          <strong className="text-sm" style={{ flex: 1 }}>{title}</strong>
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} />
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ToastHost,
  useFullscreenPanel,
  Popover,
  ListFilterButton,
  ListSortButton,
  MoreButton,
  DetailPanelHeaderActions,
  PreviewModal,
});
