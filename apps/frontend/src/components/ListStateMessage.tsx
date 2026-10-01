import type { ReactNode } from 'react';

import { Button, EmptyState } from '@fops/ui';

export type ListStateVariant = 'empty' | 'filtered' | 'error';

export interface ListStateAction {
  label: string;
  onClick: () => void;
}

export interface ListStateMessageProps {
  variant: ListStateVariant;
  title: string;
  body?: string;
  action?: ListStateAction;
  /** Preserves existing permission-specific Survey actions that are not plain buttons. */
  actionContent?: ReactNode;
}

export function ListStateMessage({
  variant,
  title,
  body,
  action,
  actionContent,
}: ListStateMessageProps) {
  const renderedAction =
    action !== undefined ? (
      <Button type="button" variant="primary" size="sm" onClick={action.onClick}>
        {action.label}
      </Button>
    ) : (
      actionContent
    );

  return (
    <div data-testid="list-state-message" data-variant={variant}>
      <EmptyState title={title} {...(body !== undefined ? { body } : {})} action={renderedAction} />
    </div>
  );
}
