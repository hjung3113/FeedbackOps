import * as React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../components/shadcn/alert-dialog.js';
import { buttonVariants } from '../components/Button.js';
import { cn } from '../utils/cn.js';

export interface DirtyConfirmationProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

const DEFAULT_TITLE = '변경사항이 저장되지 않았습니다';
const DEFAULT_MESSAGE = '이동하면 작성 중인 내용이 사라집니다.';
const DEFAULT_CONFIRM = '이동';
const DEFAULT_CANCEL = '계속 작성';

export function DirtyConfirmation({
  open,
  onConfirm,
  onCancel,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  confirmLabel = DEFAULT_CONFIRM,
  cancelLabel = DEFAULT_CANCEL,
}: DirtyConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: 'destructive' }))}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

DirtyConfirmation.displayName = 'DirtyConfirmation';
