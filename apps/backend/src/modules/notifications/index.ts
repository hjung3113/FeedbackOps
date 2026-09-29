export { notificationRoutes } from './routes.js';
export { createNotificationService, type NotificationService } from './service.js';
export {
  isNotificationEventType,
  notificationCatalogue,
  type NotificationEventType,
  type NotificationSubjectType,
  type NotificationSummaryParamsByEvent,
} from './catalogue.js';
export {
  createNotificationNotifier,
  type NotificationEnvelope,
  type NotificationNotifier,
} from './dispatcher.js';
export {
  createNoopNotificationDispatcher,
  createPgBossNotificationDispatcher,
  createRecordingNotificationDispatcher,
  NOTIFICATION_DISPATCH_QUEUE,
  type NotificationDispatcher,
  type NotificationJobPayload,
  type RecordingNotificationDispatcher,
} from './port.js';
export { createNotificationEmailChannel } from './channel-factory.js';
export {
  MockEmailChannel,
  type NotificationChannel,
  type NotificationEmailEnvelope,
} from './channels.js';
export {
  notificationDispatchHandler,
  registerNotificationJobs,
  type NotificationJobDeps,
} from './jobs/index.js';
