// /vocs — per-view shell selection route. Auth gate is inherited from
// the /_authed pathless layout route. Feature content (list rows, detail panel,
// create form, triage queue) lands in #19 / #20 / #21.
//
// #982: the search schema and the shell live in features/voc/routes so the
// router plugin can code-split the route component (it refuses when the
// component is an exported local of the route file). The route file re-exports
// them for existing consumers (findings route schema reuse, test harnesses).

import { VocRouteShell } from '@/features/voc/routes/VocRouteShell';
import {
  VOC_DEFAULT_VIEW,
  validateVocSearch,
  vocSearchSchema,
} from '@/features/voc/routes/voc-search';
import { createFileRoute } from '@tanstack/react-router';

export { validateVocSearch, vocSearchSchema, VOC_DEFAULT_VIEW };
export { VocRouteShell };

export const Route = createFileRoute('/_authed/vocs')({
  validateSearch: validateVocSearch,
  component: VocRouteShell,
});
