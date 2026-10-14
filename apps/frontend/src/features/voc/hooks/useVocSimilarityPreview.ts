import {
  type CreateVocRequest,
  type SimilarityPreviewRequest,
  type SimilarityPreviewResponse,
  similarityPreviewRequestSchema,
  similarityPreviewResponseSchema,
} from '@fops/shared';
import { useEffect, useRef, useState } from 'react';
import { type UseFormReturn, useWatch } from 'react-hook-form';

import { apiRequest, mapUnknownError } from '@/lib/api';
import { mintIdempotencyKey } from '@/lib/api/idempotency';

const DRAFT_FIELDS = ['title', 'description_rich_content', 'primary_managed_system_id'] as const;

function readDraft(form: UseFormReturn<CreateVocRequest>): SimilarityPreviewRequest {
  const { primary_managed_system_id, title, description_rich_content } = form.getValues();
  return { primary_managed_system_id, title, description_rich_content };
}

// TipTap is JSON: object key order and cloned document/array identity are irrelevant.
function equalDraftValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalDraftValue(value, right[index]))
    );
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equalDraftValue(a[key], b[key]))
  );
}

export function useVocSimilarityPreview(form: UseFormReturn<CreateVocRequest>) {
  const [title, description_rich_content, primary_managed_system_id] = useWatch({
    control: form.control,
    name: DRAFT_FIELDS,
    exact: true,
  });
  const canCheck = similarityPreviewRequestSchema.safeParse({
    primary_managed_system_id,
    title,
    description_rich_content,
  }).success;
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const clickedDraft = useRef<SimilarityPreviewRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimilarityPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name && !DRAFT_FIELDS.some((field) => field === name)) return;
      if (!clickedDraft.current || equalDraftValue(clickedDraft.current, readDraft(form))) return;
      sequence.current += 1;
      controller.current?.abort();
      controller.current = null;
      clickedDraft.current = null;
      setLoading(false);
      setResult(null);
      setError(null);
    });
    return () => {
      subscription.unsubscribe();
      sequence.current += 1;
      controller.current?.abort();
      controller.current = null;
      clickedDraft.current = null;
    };
  }, [form]);

  async function check(): Promise<void> {
    const draft = readDraft(form);
    const parsed = similarityPreviewRequestSchema.safeParse(draft);
    if (!parsed.success) return;
    controller.current?.abort();
    const requestId = ++sequence.current;
    const abortController = new AbortController();
    controller.current = abortController;
    clickedDraft.current = JSON.parse(JSON.stringify(draft)) as SimilarityPreviewRequest;
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const response = await apiRequest(
        'POST',
        '/vocs/similarity-preview',
        similarityPreviewResponseSchema,
        {
          body: parsed.data,
          idempotencyKey: mintIdempotencyKey(),
          signal: abortController.signal,
        },
      );
      if (sequence.current === requestId) setResult(response.data);
    } catch (cause) {
      if (sequence.current === requestId && !abortController.signal.aborted) {
        setError(mapUnknownError(cause).message);
      }
    } finally {
      if (sequence.current === requestId) {
        controller.current = null;
        setLoading(false);
      }
    }
  }

  return { canCheck, loading, result, error, check };
}
