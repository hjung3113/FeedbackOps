import { VOC_NO_FOLLOW_UP as copy } from '@/lib/copy/voc';
import { formatShortDate } from '@/lib/format/datetime';
import type { VocFollowUpState } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@fops/ui';
import { useVocNoFollowUpController } from './useVocNoFollowUpController';

export function NoFollowUpSection({
  vocId,
  state,
  canTriage,
  actorNames,
}: {
  vocId: string;
  state: VocFollowUpState | undefined;
  canTriage: boolean;
  actorNames: Map<string, string>;
}) {
  const controller = useVocNoFollowUpController(vocId);
  if (!state || (!state.decision && !(canTriage && state.can_record))) return null;
  return (
    <section className="flex flex-col gap-2 py-3" aria-label={copy.current}>
      {state.decision && (
        <>
          <h3 className="text-sm font-medium">{copy.current}</h3>
          <p className="whitespace-pre-wrap text-sm">{state.decision.reason}</p>
          <p className="text-xs text-text-secondary">
            <span>{actorNames.get(state.decision.actor_id) ?? state.decision.actor_id}</span>
            {' · '}
            <time dateTime={state.decision.decided_at}>
              {formatShortDate(state.decision.decided_at)}
            </time>
          </p>
        </>
      )}
      {canTriage && state.can_record && (
        <Button variant="secondary" size="sm" onClick={controller.open}>
          {copy.record}
        </Button>
      )}
      {canTriage && state.can_withdraw && (
        <Button
          variant="secondary"
          size="sm"
          disabled={controller.pending}
          onClick={() => void controller.submit('withdraw')}
        >
          {copy.withdraw}
        </Button>
      )}
      {controller.error && (
        <p role="alert" className="text-sm text-text-danger">
          {copy.error}
        </p>
      )}
      <Dialog
        open={canTriage && state.can_record && controller.draft !== null}
        onOpenChange={(open) => {
          if (!open) controller.cancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.record}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <label htmlFor="voc-no-follow-up-reason">{copy.reason}</label>
          <Textarea
            id="voc-no-follow-up-reason"
            required
            maxLength={2000}
            value={controller.draft?.reason ?? ''}
            disabled={controller.pending}
            aria-invalid={!!controller.draft?.reason && !controller.draft.reason.trim()}
            onChange={(e) => controller.changeReason(e.target.value)}
          />
          {controller.error && (
            <p role="alert" className="text-sm text-text-danger">
              {copy.error}
            </p>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={controller.cancel}>
              {copy.cancel}
            </Button>
            <Button
              variant="primary"
              data-testid="voc-no-follow-up-submit"
              disabled={
                controller.pending ||
                !controller.draft?.reason.trim() ||
                controller.draft.reason.length > 2000
              }
              onClick={() => void controller.submit('record')}
            >
              {copy.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
