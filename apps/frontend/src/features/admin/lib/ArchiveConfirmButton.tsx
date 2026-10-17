import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@fops/ui';
import { useState } from 'react';

interface ArchiveConfirmButtonProps {
  /** Record name shown in the confirmation body. */
  name: string;
  disabled: boolean;
  onConfirm: () => void;
  testId: string;
}

// Archive is irreversible (no restore lifecycle), so `보관` asks first. The
// trigger lives inside the AlertDialog root, so Radix returns focus to it on cancel.
export function ArchiveConfirmButton({
  name,
  disabled,
  onConfirm,
  testId,
}: ArchiveConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={disabled} data-testid={testId}>
          보관
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={`${testId}-confirm-dialog`}>
        <AlertDialogHeader>
          <AlertDialogTitle>보관할까요?</AlertDialogTitle>
          <AlertDialogDescription>{name}을(를) 보관하면 되돌릴 수 없습니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            보관
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
