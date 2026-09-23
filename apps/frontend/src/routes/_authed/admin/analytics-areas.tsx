import { createFileRoute } from '@tanstack/react-router';

import { AnalyticsAreasAdminPage } from '../../../features/admin/analytics-areas/AnalyticsAreasScreen.js';
import { analyticsAreasSearchSchema } from '../../../features/admin/analytics-areas/search.js';

export { analyticsAreasSearchSchema };
export { AnalyticsAreasAdminPage };

export const Route = createFileRoute('/_authed/admin/analytics-areas')({
  validateSearch: (raw) => analyticsAreasSearchSchema.parse(raw),
  component: AnalyticsAreasAdminPage,
});
