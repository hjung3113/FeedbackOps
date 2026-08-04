import { z } from 'zod';

export const vocPreSubmitPeerSchema = z.object({
  id: z.string().uuid(),
  display_id: z.string(),
  title: z.string(),
  created_at: z.string().datetime(),
}).strict();
export type VocPreSubmitPeer = z.infer<typeof vocPreSubmitPeerSchema>;

export const vocPreSubmitPeersResponseSchema = z.object({
  items: z.array(vocPreSubmitPeerSchema).max(3),
}).strict();
export type VocPreSubmitPeersResponse = z.infer<typeof vocPreSubmitPeersResponseSchema>;
