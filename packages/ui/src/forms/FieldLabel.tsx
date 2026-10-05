import { HelpCircle } from 'lucide-react';
import type * as React from 'react';
import { Label } from '../components/shadcn/label.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';

export interface FieldLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {
  required?: boolean;
  tip?: string;
  children: React.ReactNode;
}

export function FieldLabel({ required, tip, children, className, ...props }: FieldLabelProps) {
  return (
    <Label className={className} {...props}>
      {children}
      {required === true && (
        <span className="ml-1 text-text-danger-label" aria-hidden="true">
          *
        </span>
      )}
      {tip !== undefined && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`도움말: ${tip}`}
                className="ml-1 inline-flex cursor-default items-center rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                data-testid="field-label-tip-trigger"
              >
                <HelpCircle size={12} className="text-text-muted" aria-hidden="true" />
                <span className="sr-only">{tip}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
  );
}

FieldLabel.displayName = 'FieldLabel';
