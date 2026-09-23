import { useMutation } from '@tanstack/react-query';

import {
  type RegisterAnalyticsAreaBody,
  type UpdateAnalyticsAreaBody,
  archiveAnalyticsArea,
  registerAnalyticsArea,
  updateAnalyticsArea,
} from '../../../lib/api';
import { envelopeMessage } from '../lib/envelopeMessage.js';

export function useRegisterAnalyticsAreaMutation(opts: {
  onSaved: () => Promise<void>;
  onErrorMessage: (message: string) => void;
}) {
  return useMutation({
    mutationFn: async (body: RegisterAnalyticsAreaBody) => registerAnalyticsArea(body),
    onSuccess: async () => {
      await opts.onSaved();
    },
    onError: (err) => opts.onErrorMessage(envelopeMessage(err)),
  });
}

export function useUpdateAnalyticsAreaMutation(opts: {
  targetId: string;
  onSaved: () => Promise<void>;
  onErrorMessage: (message: string) => void;
}) {
  return useMutation({
    mutationFn: async (body: UpdateAnalyticsAreaBody) => updateAnalyticsArea(opts.targetId, body),
    onSuccess: async () => {
      await opts.onSaved();
    },
    onError: (err) => opts.onErrorMessage(envelopeMessage(err)),
  });
}

export function useArchiveAnalyticsAreaMutation(opts: {
  targetId: string;
  onSaved: () => Promise<void>;
  onErrorMessage: (message: string) => void;
}) {
  return useMutation({
    mutationFn: async () => archiveAnalyticsArea(opts.targetId),
    onSuccess: async () => {
      await opts.onSaved();
    },
    onError: (err) => opts.onErrorMessage(envelopeMessage(err)),
  });
}
