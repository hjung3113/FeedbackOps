import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { Label } from '../components/shadcn/label.js';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
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
        <span className="ml-1 text-red-500" aria-hidden="true">
          *
        </span>
      )}
      {tip !== undefined && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="ml-1 inline-flex cursor-default items-center"
                data-testid="field-label-tip-trigger"
              >
                <HelpCircle size={12} className="text-text-muted" aria-hidden="true" />
                <span className="sr-only">{tip}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
  );
}

FieldLabel.displayName = 'FieldLabel';
