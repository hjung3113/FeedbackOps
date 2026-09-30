import { createFileRoute } from '@tanstack/react-router';

import { AnalyticsAreasAdminPage } from '../../../features/admin/analytics-areas/AnalyticsAreasScreen.js';
import {
  analyticsAreasSearchSchema,
  validateAnalyticsAreasSearch,
} from '../../../features/admin/analytics-areas/search.js';

export { analyticsAreasSearchSchema };
export { AnalyticsAreasAdminPage };

export const Route = createFileRoute('/_authed/admin/analytics-areas')({
  validateSearch: validateAnalyticsAreasSearch,
  component: AnalyticsAreasAdminPage,
});
