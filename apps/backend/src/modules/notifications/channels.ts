import type { JobLog } from '../../lib/job-log.js';
import type { NotificationEventType, NotificationSubjectType } from './catalogue.js';

export interface NotificationEmailEnvelope {
  workspace_id: string;
  actor_id: string;
  event_type: NotificationEventType;
  subject_type: NotificationSubjectType;
  subject_id: string;
  locale: 'ko-KR';
  summary: string;
  body?: string;
  in_app: true;
  email: true;
  recipient_email: string;
}

export interface NotificationChannel {
  send(envelope: NotificationEmailEnvelope): Promise<void>;
}

export class MockEmailChannel implements NotificationChannel {
  constructor(private readonly log: JobLog) {}

  async send(envelope: NotificationEmailEnvelope): Promise<void> {
    this.log.info('notification.email.mock', {
      workspace_id: envelope.workspace_id,
      actor_id: envelope.actor_id,
      event_type: envelope.event_type,
      subject_type: envelope.subject_type,
      subject_id: envelope.subject_id,
      locale: envelope.locale,
      summary: envelope.summary,
    });
  }
}
