// PLAN-22 C9 RED scaffold — replaced in GREEN.
import type { TipTapDoc } from './RichEditor';

export type ClientSanitizeSurface =
  | 'voc-description'
  | 'reporter-reply'
  | 'public-update'
  | 'internal-comment';

export function sanitizeClient(_doc: TipTapDoc, _surface: ClientSanitizeSurface): TipTapDoc {
  throw new Error('not implemented (RED)');
}
