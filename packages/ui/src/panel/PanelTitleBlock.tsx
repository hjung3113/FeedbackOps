import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PanelTitleBlockProps {
  title: string;
  badges?: React.ReactNode;
  className?: string;
}

export function PanelTitleBlock({ title, badges, className }: PanelTitleBlockProps) {
  return (
    <div className={cn('flex flex-col gap-2 px-4 py-3', className)}>
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      {badges !== undefined && (
        <div className="flex flex-wrap gap-2">{badges}</div>
      )}
    </div>
  );
}
