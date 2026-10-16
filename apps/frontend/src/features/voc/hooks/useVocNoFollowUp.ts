import { apiRequest } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import { recordVocNoFollowUpRequestSchema, vocNoFollowUpResponseSchema } from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type DecisionIntent = { vocId: string; action: 'record' | 'withdraw'; reason: string; key: string };
export function useVocNoFollowUp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (intent: DecisionIntent) =>
      apiRequest(
        intent.action === 'record' ? 'POST' : 'DELETE',
        `/vocs/${intent.vocId}/no-follow-up`,
        vocNoFollowUpResponseSchema,
        {
          idempotencyKey: intent.key,
          ...(intent.action === 'record'
            ? { body: recordVocNoFollowUpRequestSchema.parse({ reason: intent.reason }) }
            : {}),
        },
      ),
    onSuccess: async (_, intent) => {
      invalidateNavCounts(client);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['voc', intent.vocId] }),
        client.invalidateQueries({ queryKey: ['vocs'] }),
        invalidateRecovery(client),
        client.invalidateQueries({ queryKey: ['dashboard-area-report'] }),
      ]);
    },
  });
}
