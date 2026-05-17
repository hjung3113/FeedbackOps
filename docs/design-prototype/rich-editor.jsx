// ============================================================
// FeedbackOps — Rich Content Editor (4-surface)
// Spec: docs/adr/0002-use-wysiwyg-first-rich-content-editor.md
//       docs/adr/0011-rich-content-editor-and-attachment-storage.md
//       docs/frontend/interaction-patterns.md §VOC Communication Surfaces
//
// Surfaces — each with a different toolbar allowlist:
//   voc-description    — full body for a new VOC. Bold/Italic/Underline/Code/List/Link/Attach
//   reporter-reply     — reporter-facing message. Bold/Italic/Link/Attach (no @mention)
//   public-update      — reporter-visible status change. Bold/Italic/List
//                         (no Link/Attach/Mention — public-safe limit)
//   internal-comment   — internal-only note. Bold/Italic/Code/List/Link/@Mention/Attach
//
// Implementation: thin contentEditable wrapper using document.execCommand.
// Production should swap in a real editor (e.g. TipTap) per ADR-0002 — the
// surface contract (allowed actions) is what the rest of the app calls.
// ============================================================
const { useState: useRteState, useRef: useRteRef, useEffect: useRteEffect } = React;

const RTE_SURFACES = {
  'voc-description': {
    label: 'VOC 본문',
    tools: ['bold', 'italic', 'underline', 'code', 'list', 'link', 'attach'],
    accent: 'var(--color-aether-blue)',
    placeholderDefault: '문제 상황을 적어주세요. 재현 단계, 기대 결과, 실제 결과 순으로 적으면 빠르게 처리할 수 있어요.',
    footer: '본인이 직접 겪은 일을 기준으로 적어주세요. 첨부 파일은 50MB 이하.',
  },
  'reporter-reply': {
    label: 'Reporter 회신',
    tools: ['bold', 'italic', 'link', 'attach'],
    accent: 'var(--color-cyan-spark)',
    placeholderDefault: '리포터와의 공개 대화…',
    footer: '공개 타임라인에 기록되며 리포터에게 알림이 발송됩니다.',
    surfaceWarn: '리포터에게 보이는 메시지입니다. 내부 도구/티켓 ID는 노출하지 않는 게 안전합니다.',
  },
  'public-update': {
    label: 'Public 업데이트',
    tools: ['bold', 'italic', 'list'],
    accent: 'var(--color-neon-lime)',
    placeholderDefault: '리포터에게 어떤 진행 사항을 알릴까요?',
    footer: 'Reporter-facing status가 변경됩니다. 공개 안전한 표현인지 한 번 더 확인하세요.',
    surfaceWarn: '리포터에게 노출됩니다. 첨부 · 외부 링크 · @멘션은 사용할 수 없습니다.',
  },
  'internal-comment': {
    label: '내부 노트',
    tools: ['bold', 'italic', 'code', 'list', 'link', 'mention', 'attach'],
    accent: 'var(--color-deep-violet, #8b5cf6)',
    placeholderDefault: '내부 노트 (리포터에게 보이지 않음)…',
    footer: '팀원에게만 보입니다. 코드 블록 · @멘션을 자유롭게 사용하세요.',
  },
};

const RTE_TOOL_META = {
  bold:      { icon: 'bold',      cmd: 'bold',          title: '굵게 (⌘B)' },
  italic:    { icon: 'italic',    cmd: 'italic',        title: '기울임 (⌘I)' },
  underline: { icon: 'underline', cmd: 'underline',     title: '밑줄 (⌘U)' },
  code:      { icon: 'code',      cmd: 'code',          title: '코드' },
  list:      { icon: 'list',      cmd: 'insertUnorderedList', title: '리스트' },
  link:      { icon: 'link',      cmd: 'link',          title: '링크 추가' },
  attach:    { icon: 'attach',    cmd: 'attach',        title: '첨부' },
  mention:   { icon: 'user',      cmd: 'mention',       title: '@멘션' },
};

// `code` isn't a native execCommand; emulate via inline <code> wrapper.
function wrapSelectionInTag(tag) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const node = document.createElement(tag);
  node.appendChild(range.extractContents());
  range.insertNode(node);
  // Reselect inserted content for UX continuity
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

function RichEditor({
  surface = 'internal-comment',
  value,            // optional controlled HTML
  defaultValue,
  placeholder,
  onChange,
  onAttach,
  onMention,
  showLabel = false,
  minHeight = 96,
}) {
  const cfg = RTE_SURFACES[surface] || RTE_SURFACES['internal-comment'];
  const bodyRef = useRteRef(null);
  const [active, setActive] = useRteState({}); // which tools are active for current selection
  const [attachments, setAttachments] = useRteState([]);
  const [linkOpen, setLinkOpen] = useRteState(false);
  const [linkValue, setLinkValue] = useRteState('');
  const [focused, setFocused] = useRteState(false);

  // Initialize content once
  useRteEffect(() => {
    if (bodyRef.current && value !== undefined) {
      if (bodyRef.current.innerHTML !== value) bodyRef.current.innerHTML = value;
    } else if (bodyRef.current && defaultValue && !bodyRef.current.innerHTML) {
      bodyRef.current.innerHTML = defaultValue;
    }
  }, [value, defaultValue]);

  // Track which formatting commands are active for the current selection
  const refreshActiveState = () => {
    const next = {};
    cfg.tools.forEach(t => {
      const meta = RTE_TOOL_META[t];
      if (!meta) return;
      try {
        // queryCommandState returns false for our custom commands — that's fine.
        next[t] = document.queryCommandState ? document.queryCommandState(meta.cmd) : false;
      } catch (e) { next[t] = false; }
    });
    setActive(next);
  };

  const handleToolClick = (tool) => {
    if (!cfg.tools.includes(tool)) return;
    bodyRef.current?.focus();
    if (tool === 'code') {
      wrapSelectionInTag('code');
    } else if (tool === 'link') {
      setLinkOpen(true);
    } else if (tool === 'attach') {
      if (onAttach) onAttach();
      else {
        // Open a synthetic file picker — production wires the storage upload.
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => {
          const files = Array.from(e.target.files || []);
          setAttachments(prev => [...prev, ...files.map(f => ({ name: f.name, size: f.size }))]);
        };
        input.click();
      }
    } else if (tool === 'mention') {
      if (onMention) onMention();
      else {
        document.execCommand('insertText', false, '@');
      }
    } else {
      const meta = RTE_TOOL_META[tool];
      try { document.execCommand(meta.cmd, false, null); } catch (e) { /* noop */ }
    }
    refreshActiveState();
    if (bodyRef.current && onChange) onChange(bodyRef.current.innerHTML);
  };

  const handleInput = () => {
    refreshActiveState();
    if (bodyRef.current && onChange) onChange(bodyRef.current.innerHTML);
  };

  const handleKeyDown = (e) => {
    // Keyboard shortcuts for common formatting
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b' && cfg.tools.includes('bold')) { e.preventDefault(); handleToolClick('bold'); }
      if (e.key === 'i' && cfg.tools.includes('italic')) { e.preventDefault(); handleToolClick('italic'); }
      if (e.key === 'u' && cfg.tools.includes('underline')) { e.preventDefault(); handleToolClick('underline'); }
      if (e.key === 'k' && cfg.tools.includes('link')) { e.preventDefault(); handleToolClick('link'); }
    }
    if (e.key === '@' && cfg.tools.includes('mention') && onMention) {
      onMention();
    }
  };

  const handleLinkConfirm = () => {
    if (linkValue) {
      try { document.execCommand('createLink', false, linkValue); } catch (e) { /* noop */ }
    }
    setLinkOpen(false);
    setLinkValue('');
    refreshActiveState();
    if (bodyRef.current && onChange) onChange(bodyRef.current.innerHTML);
  };

  return (
    <div className={`rte rte-surface-${surface} ${focused ? 'focused' : ''}`}
      style={{ borderColor: focused ? cfg.accent : undefined }}>
      {showLabel && (
        <div className="rte-label" style={{ color: cfg.accent }}>
          {cfg.label}
        </div>
      )}
      <div className="rte-toolbar">
        {cfg.tools.map(t => {
          const meta = RTE_TOOL_META[t];
          if (!meta) return null;
          return (
            <button
              key={t}
              type="button"
              className={`rte-tool ${active[t] ? 'active' : ''}`}
              title={meta.title}
              onMouseDown={(e) => e.preventDefault()} // keep selection
              onClick={() => handleToolClick(t)}>
              <Icon name={meta.icon} size={11} />
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span className="text-xs muted" style={{ color: cfg.accent, opacity: 0.7 }}>
          {cfg.label}
        </span>
      </div>

      <div
        ref={bodyRef}
        className="rte-body"
        contentEditable
        suppressContentEditableWarning
        spellCheck={true}
        style={{ minHeight }}
        data-placeholder={placeholder || cfg.placeholderDefault}
        onInput={handleInput}
        onKeyUp={refreshActiveState}
        onMouseUp={refreshActiveState}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      {attachments.length > 0 && (
        <div className="rte-attachments">
          {attachments.map((a, i) => (
            <span key={i} className="rte-attachment">
              <Icon name="attach" size={10} />
              <span>{a.name}</span>
              <button
                type="button"
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: 0, marginLeft: 4,
                }}>
                <Icon name="close" size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {linkOpen && (
        <div className="rte-link-popover">
          <Icon name="link" size={11} />
          <input
            autoFocus
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleLinkConfirm(); }
              if (e.key === 'Escape') { setLinkOpen(false); setLinkValue(''); }
            }}
            placeholder="https://"
            className="rte-link-input"
          />
          <Button variant="subtle" size="sm" onClick={handleLinkConfirm}>적용</Button>
        </div>
      )}

      <div className="rte-footer">
        <span className="text-xs muted">{cfg.footer}</span>
      </div>

      {cfg.surfaceWarn && (
        <div className="rte-surface-warn" style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(242,196,109,0.06)',
          padding: '6px 12px',
        }}>
          <span className="text-xs" style={{ color: 'var(--color-amber)' }}>
            <Icon name="warn" size={10} style={{ marginRight: 4 }} />
            {cfg.surfaceWarn}
          </span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RichEditor, RTE_SURFACES });
