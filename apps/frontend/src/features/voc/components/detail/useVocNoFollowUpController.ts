import { useVocNoFollowUp } from '@/features/voc/hooks/useVocNoFollowUp';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { useEffect, useRef, useState } from 'react';

/** Mounted with VOC/scope/permission key; settlements from discarded drafts only refresh caches. */
export function useVocNoFollowUpController(vocId: string) {
  const mutation = useVocNoFollowUp();
  const [draft, setDraft] = useState<{ reason: string; key: string } | null>(null);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(false);
  const generation = useRef(0);
  const withdrawalKey = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function cancel() {
    generation.current++;
    setDraft(null);
    setError(false);
  }
  async function submit(action: 'record' | 'withdraw') {
    if (
      inFlight.current ||
      (action === 'record' && (!draft || !draft.reason.trim() || draft.reason.length > 2000))
    )
      return;
    const submitted = draft;
    const submittedGeneration = generation.current;
    if (action === 'withdraw' && !withdrawalKey.current)
      withdrawalKey.current = mintIdempotencyKey();
    const key = action === 'record' ? draft?.key : withdrawalKey.current;
    if (!key) return;
    inFlight.current = true;
    setError(false);
    try {
      await mutation.mutateAsync({
        vocId,
        action,
        reason: draft?.reason ?? '',
        key,
      });
      if (action === 'withdraw') withdrawalKey.current = null;
      if (alive.current && generation.current === submittedGeneration) {
        // Cancel/reopen while pending cannot reset the new draft.
        setDraft((current) => (current === submitted ? null : current));
      }
    } catch {
      if (alive.current && generation.current === submittedGeneration) setError(true);
    } finally {
      inFlight.current = false;
    }
  }
  return {
    draft,
    error,
    pending: mutation.isPending,
    open: () => {
      generation.current++;
      setError(false);
      setDraft({ reason: '', key: mintIdempotencyKey() });
    },
    changeReason: (reason: string) => setDraft({ reason, key: mintIdempotencyKey() }),
    cancel,
    submit,
  };
}
