import * as React from 'react';
import { Link2, Maximize2, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn.js';
import type { DetailPanelKind } from './DetailPanelHeader.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/shadcn/dropdown-menu.js';

export interface DetailPanelHeaderActionsProps {
  entityKind: DetailPanelKind;
  entityId: string;
  copyUrl: string;
  onExpandToggle?: () => void;
  extraMore?: React.ReactNode;
}

const DEFERRED_ITEMS: Array<{ label: string; disabledReason: string }> = [
  { label: '읽음 표시',  disabledReason: 'Slice 3+에 출시 예정' },
  { label: '스누즈',     disabledReason: 'Slice 3+에 출시 예정' },
  { label: '구독',       disabledReason: 'Slice 3+에 출시 예정' },
  { label: '보관',       disabledReason: 'Slice 3+에 출시 예정' },
];

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
  function handleCopyLink() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(copyUrl);
    }
    toast('링크가 복사되었습니다.');
  }

  return (
    <div className="flex items-center gap-1">
      {/* Copy link */}
      <button
        type="button"
        aria-label="링크 복사"
        title="링크 복사"
        className={iconButtonCls}
        onClick={handleCopyLink}
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
          <button
            type="button"
            aria-label="더 보기"
            title="더 보기"
            className={iconButtonCls}
          >
            <MoreVertical size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extraMore}
          {DEFERRED_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled
              title={item.disabledReason}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
