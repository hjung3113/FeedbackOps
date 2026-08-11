import { Link2, Maximize2, MoreVertical } from 'lucide-react';
import type * as React from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/shadcn/dropdown-menu.js';
import { cn } from '../utils/cn.js';
import type { DetailPanelKind } from './DetailPanelHeader.js';

export interface DetailPanelHeaderActionsProps {
  entityKind: DetailPanelKind;
  entityId: string;
  copyUrl: string;
  onExpandToggle?: () => void;
  extraMore?: React.ReactNode;
}

const DEFERRED_ITEMS: Array<{ label: string; disabledReason: string }> = [
  { label: '읽음 표시', disabledReason: 'Slice 3+에 출시 예정' },
  { label: '스누즈', disabledReason: 'Slice 3+에 출시 예정' },
  { label: '구독', disabledReason: 'Slice 3+에 출시 예정' },
  { label: '보관', disabledReason: 'Slice 3+에 출시 예정' },
];

/**
 * Copies `text`, returning whether it actually landed on the clipboard.
 *
 * `navigator.clipboard` is secure-context only, so it is absent whenever the
 * app is served over http from anything but localhost — which is exactly how
 * the dev server is reached when it binds 0.0.0.0 and someone else on the
 * network opens it by IP. `document.execCommand('copy')` still works there.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or a detached document — fall through to the range copy.
    }
  }
  if (typeof document === 'undefined' || !document.body) return false;

  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  // Kept in the viewport but invisible: `display:none` is not selectable, and
  // an off-screen position makes some browsers scroll on focus.
  scratch.style.position = 'fixed';
  scratch.style.top = '0';
  scratch.style.opacity = '0';
  scratch.style.pointerEvents = 'none';
  document.body.appendChild(scratch);
  scratch.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  scratch.remove();
  return copied;
}

const iconButtonCls = cn(
  'flex items-center justify-center rounded p-1',
  'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

export function DetailPanelHeaderActions({
  entityKind: _entityKind,
  entityId: _entityId,
  copyUrl,
  onExpandToggle,
  extraMore,
}: DetailPanelHeaderActionsProps) {
  async function handleCopyLink() {
    // Callers pass either an absolute URL or a route path; resolving against
    // the current document makes both produce something pasteable.
    const absolute =
      typeof window !== 'undefined' ? new URL(copyUrl, window.location.href).href : copyUrl;

    if (await writeToClipboard(absolute)) {
      toast('링크가 복사되었습니다.');
    } else {
      // Saying "복사되었습니다" after copying nothing is worse than failing:
      // the actor pastes stale content and never learns why.
      toast.error('링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.');
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Copy link */}
      <button
        type="button"
        aria-label="링크 복사"
        title="링크 복사"
        className={iconButtonCls}
        onClick={() => {
          void handleCopyLink();
        }}
      >
        <Link2 size={16} />
      </button>

      {/* Expand toggle — hidden when no handler */}
      {onExpandToggle !== undefined && (
        <button
          type="button"
          aria-label="전체 화면 전환"
          title="전체 화면 전환"
          className={iconButtonCls}
          onClick={onExpandToggle}
        >
          <Maximize2 size={16} />
        </button>
      )}

      {/* Kebab dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="더 보기" title="더 보기" className={iconButtonCls}>
            <MoreVertical size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extraMore}
          {DEFERRED_ITEMS.map((item) => (
            <DropdownMenuItem key={item.label} disabled title={item.disabledReason}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
