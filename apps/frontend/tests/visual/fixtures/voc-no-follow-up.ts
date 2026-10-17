import { vocDetailEnvelopeSchema } from '@fops/shared';
import { populatedReviewVoc } from './voc-public-update-review';

export const eligibleNoFollowUpVoc = vocDetailEnvelopeSchema.parse({
  ...populatedReviewVoc,
  follow_up: { decision: null, can_record: true, can_withdraw: false },
});
export const decidedNoFollowUpVoc = vocDetailEnvelopeSchema.parse({
  ...eligibleNoFollowUpVoc,
  follow_up: {
    decision: {
      decision: 'no_follow_up',
      reason: '기존 안내로 해결되어 추가 조치가 필요하지 않습니다.',
      // Admin One from the default /actors fixture, so the decider renders by name.
      actor_id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      decided_at: '2026-07-18T09:00:00.000Z',
    },
    can_record: false,
    can_withdraw: true,
  },
});
