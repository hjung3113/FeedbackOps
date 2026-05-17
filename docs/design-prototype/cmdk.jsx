// ============================================================
// FeedbackOps — Command Menu (⌘K)
// Spec: interaction-patterns.md §Cross-System navigation —
//   verbs (Go to · Create · Open · Filter · Switch scope)
//   objects (VOC · Finding · Task · Survey · Milestone · Coverage · Admin)
// ============================================================
const { useState: useCmdState, useEffect: useCmdEffect, useMemo: useCmdMemo, useRef: useCmdRef } = React;

// Build the canonical command catalog. Production should split this into
// per-domain providers (`useNavCommands()`, `useEntityCommands()`) so each
// system contributes its own verbs.
function buildCommands(actorId = 'u-1') {
  return [
    // ---- Navigate ----
    { id: 'go-home',       group: 'Navigate', verb: 'Go to', label: 'Home',                 icon: 'home',       route: 'home' },
    { id: 'go-mywork',     group: 'Navigate', verb: 'Go to', label: 'My Work',              icon: 'inbox',      route: 'my-work' },
    { id: 'go-voc-inbox',  group: 'Navigate', verb: 'Go to', label: 'VOC · Inbox',          icon: 'voc',        route: 'voc',           view: 'inbox' },
    { id: 'go-voc-triage', group: 'Navigate', verb: 'Go to', label: 'VOC · Triage',         icon: 'flag',       route: 'voc',           view: 'triage' },
    { id: 'go-voc-my',     group: 'Navigate', verb: 'Go to', label: 'VOC · My VOCs',        icon: 'user',       route: 'voc',           view: 'my' },
    { id: 'go-clusters',   group: 'Navigate', verb: 'Go to', label: 'VOC · Clusters',       icon: 'layers',     route: 'voc-clusters' },
    { id: 'go-findings',   group: 'Navigate', verb: 'Go to', label: 'Findings',             icon: 'finding',    route: 'findings' },
    { id: 'go-tasks-inbox',label: 'Tasks · Inbox',    group: 'Navigate', verb: 'Go to', icon: 'inbox',          route: 'tasks',         view: 'inbox' },
    { id: 'go-tasks-my',   label: 'Tasks · My Tasks', group: 'Navigate', verb: 'Go to', icon: 'user',           route: 'tasks',         view: 'my' },
    { id: 'go-tasks-board',group: 'Navigate', verb: 'Go to', label: 'Tasks · Board',        icon: 'task',       route: 'tasks',         view: 'board' },
    { id: 'go-tasks-req',  group: 'Navigate', verb: 'Go to', label: 'Tasks · Requests',     icon: 'inbox',      route: 'tasks',         view: 'requests' },
    { id: 'go-tasks-back', group: 'Navigate', verb: 'Go to', label: 'Tasks · Backlog',      icon: 'layers',     route: 'tasks',         view: 'backlog' },
    { id: 'go-tasks-ms',   group: 'Navigate', verb: 'Go to', label: 'Tasks · Milestones',   icon: 'flag',       route: 'tasks',         view: 'milestones' },
    { id: 'go-tasks-road', group: 'Navigate', verb: 'Go to', label: 'Tasks · Roadmap',      icon: 'pulse',      route: 'tasks',         view: 'roadmap' },
    { id: 'go-integ',      group: 'Navigate', verb: 'Go to', label: 'Integration · Action dashboard', icon: 'pulse',  route: 'integration' },
    { id: 'go-evidence',   group: 'Navigate', verb: 'Go to', label: 'Integration · Evidence', icon: 'doc',      route: 'integration-evidence' },
    { id: 'go-coverage',   group: 'Navigate', verb: 'Go to', label: 'Integration · Coverage', icon: 'layers',   route: 'integration-coverage' },
    { id: 'go-links',      group: 'Navigate', verb: 'Go to', label: 'Integration · Entity links', icon: 'link', route: 'integration-links' },
    { id: 'go-surveys',    group: 'Navigate', verb: 'Go to', label: 'Surveys',              icon: 'survey',     route: 'surveys' },
    { id: 'go-admin',      group: 'Navigate', verb: 'Go to', label: 'Admin · Managed systems', icon: 'database', route: 'admin' },
    { id: 'go-areas',      group: 'Navigate', verb: 'Go to', label: 'Admin · Analytics areas', icon: 'layers',  route: 'admin-areas' },
    { id: 'go-perm',       group: 'Navigate', verb: 'Go to', label: 'Admin · Permission requests', icon: 'shield', route: 'admin-permissions' },
    { id: 'go-settings',   group: 'Navigate', verb: 'Go to', label: 'Admin · Workspace settings', icon: 'settings', route: 'admin-settings' },

    // ---- Create ----
    { id: 'new-voc',     group: 'Create', verb: 'Create', label: 'New VOC',     icon: 'voc',     route: 'voc-new', kbd: 'C' },
    { id: 'new-task',    group: 'Create', verb: 'Create', label: 'New task',    icon: 'task',    route: 'tasks', view: 'backlog' },
    { id: 'new-survey',  group: 'Create', verb: 'Create', label: 'New survey',  icon: 'survey',  route: 'survey-builder', param: 'SRV-DRAFT-NEW' },

    // ---- Switch scope ----
    ...(window.ManagedSystems || []).map(m => ({
      id: `scope-${m.id}`, group: 'Switch scope', verb: 'Switch scope to', label: m.name, icon: 'database', scopeId: m.id, mark: m.mark, color: m.color,
    })),
    { id: 'scope-all', group: 'Switch scope', verb: 'Switch scope to', label: 'All Managed Systems', icon: 'pulse', scopeId: 'all' },

    // ---- Open entity (recent / pinned) ----
    ...(window.Vocs || []).slice(0, 6).map(v => ({
      id: `open-${v.id}`, group: 'Open', verb: 'Open', label: `${v.id} · ${v.title}`, icon: 'voc', route: 'voc', view: 'inbox',
    })),
  ];
}

function fuzzyMatch(query, str) {
  if (!query) return { ok: true, score: 0 };
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  if (s.includes(q)) return { ok: true, score: 100 - s.indexOf(q) };
  // sparse subsequence match — every char of q appears in s in order
  let si = 0;
  let hits = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = s.indexOf(q[i], si);
    if (idx === -1) return { ok: false, score: 0 };
    hits++; si = idx + 1;
  }
  return { ok: hits === q.length, score: 30 };
}

function CommandMenu({ open, onClose, onNavigate, onScopeChange }) {
  const [query, setQuery] = useCmdState('');
  const [activeIdx, setActiveIdx] = useCmdState(0);
  const inputRef = useCmdRef(null);
  const listRef = useCmdRef(null);

  const allCommands = useCmdMemo(() => buildCommands(), []);

  const filtered = useCmdMemo(() => {
    if (!query) return allCommands;
    return allCommands
      .map(c => ({ c, m: fuzzyMatch(query, `${c.verb} ${c.label}`) }))
      .filter(x => x.m.ok)
      .sort((a, b) => b.m.score - a.m.score)
      .map(x => x.c);
  }, [allCommands, query]);

  // Group commands while preserving filtered order
  const grouped = useCmdMemo(() => {
    const groups = {};
    filtered.forEach(c => {
      groups[c.group] = groups[c.group] || [];
      groups[c.group].push(c);
    });
    return groups;
  }, [filtered]);

  // Reset active index whenever the filtered list changes shape
  useCmdEffect(() => { setActiveIdx(0); }, [query]);

  // Focus the input every time we open
  useCmdEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keyboard navigation
  useCmdEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[activeIdx];
        if (cmd) executeCommand(cmd);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, activeIdx]);

  // Scroll active item into view
  useCmdEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector(`[data-cmd-idx="${activeIdx}"]`);
    if (node) {
      const r = node.getBoundingClientRect();
      const lr = listRef.current.getBoundingClientRect();
      if (r.bottom > lr.bottom) {
        listRef.current.scrollTop += r.bottom - lr.bottom;
      } else if (r.top < lr.top) {
        listRef.current.scrollTop -= lr.top - r.top;
      }
    }
  }, [activeIdx, open]);

  const executeCommand = (cmd) => {
    if (cmd.scopeId) {
      const ms = cmd.scopeId === 'all'
        ? { id: 'all' }
        : window.msById(cmd.scopeId);
      onScopeChange(ms);
    } else if (cmd.route) {
      onNavigate(cmd.route, cmd.view || cmd.param);
    }
    onClose();
  };

  if (!open) return null;

  // Compute the running global index for each item so keyboard activation
  // and click match (since we render by group but navigate as a flat list).
  let runningIdx = 0;

  return (
    <div
      className="cmdk-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label="Command menu">
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <Icon name="search" size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="명령 또는 항목 검색…  (예: New VOC, Tasks Board, Tableau)"
            className="cmdk-input"
          />
          <span className="kbd">ESC</span>
        </div>

        <div className="cmdk-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="cmdk-empty">
              <Icon name="search" size={14} />
              <span>일치하는 명령이 없습니다.</span>
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="cmdk-group">
              <div className="cmdk-group-title">{group}</div>
              {items.map((cmd) => {
                const idx = runningIdx++;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={cmd.id}
                    data-cmd-idx={idx}
                    className={`cmdk-item ${isActive ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => executeCommand(cmd)}>
                    {cmd.mark ? (
                      <div className="scope-mark" style={{
                        width: 18, height: 18, background: cmd.color, color: 'white',
                      }}>{cmd.mark}</div>
                    ) : (
                      <div className="cmdk-item-icon">
                        <Icon name={cmd.icon || 'doc'} size={13} />
                      </div>
                    )}
                    <span className="cmdk-item-verb">{cmd.verb}</span>
                    <span className="cmdk-item-label">{cmd.label}</span>
                    {cmd.kbd && <span className="kbd">{cmd.kbd}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk-footer">
          <span className="hstack" style={{ gap: 4 }}>
            <span className="kbd">↑</span><span className="kbd">↓</span>
            <span className="text-xs muted">탐색</span>
          </span>
          <span className="hstack" style={{ gap: 4 }}>
            <span className="kbd">↵</span>
            <span className="text-xs muted">실행</span>
          </span>
          <span className="hstack" style={{ gap: 4 }}>
            <span className="kbd">esc</span>
            <span className="text-xs muted">닫기</span>
          </span>
          <div style={{ flex: 1 }} />
          <span className="text-xs muted">{filtered.length}개 명령</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CommandMenu });
