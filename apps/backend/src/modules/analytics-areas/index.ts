export {
  createAnalyticsAreaService,
  type AnalyticsAreaService,
  type AnalyticsAreaServiceDeps,
  type AnalyticsAreaDto,
  type RegisterAnalyticsAreaBody,
  type UpdateAnalyticsAreaBody,
  AA_SLUG_REGEX,
  cascadeArchiveActiveChildren,
  archiveAnalyticsAreaInTx,
} from './analytics-area-service.js';
export { analyticsAreasRoutes, type AnalyticsAreasRoutesOptions } from './routes.js';
