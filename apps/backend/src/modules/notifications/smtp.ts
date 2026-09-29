import nodemailer from 'nodemailer';

import type { JobLog } from '../../lib/job-log.js';
import type { NotificationChannel, NotificationEmailEnvelope } from './channels.js';

interface SmtpEmailChannelConfig {
  host: string;
  port: number;
  from: string;
  username?: string | undefined;
  password?: string | undefined;
}

interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  requireTLS?: boolean;
  auth?: { user: string; pass: string };
}

interface SmtpMail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

interface SmtpSendResult {
  messageId?: string;
  rejected?: unknown[];
}

interface SmtpTransport {
  sendMail(message: SmtpMail): Promise<SmtpSendResult>;
}

type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransport;

function createNodemailerTransport(options: SmtpTransportOptions): SmtpTransport {
  const transporter = nodemailer.createTransport(options);
  return {
    async sendMail(message) {
      const result = await transporter.sendMail(message);
      return { messageId: result.messageId, rejected: result.rejected };
    },
  };
}

function transportOptions(config: SmtpEmailChannelConfig): SmtpTransportOptions {
  const credentials =
    config.username && config.password
      ? {
          // Never send relay credentials over an unencrypted session.
          ...(config.port === 465 ? {} : { requireTLS: true }),
          auth: { user: config.username, pass: config.password },
        }
      : {};

  return {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    ...credentials,
  };
}

class SmtpSendError extends Error {
  readonly code?: string;
  readonly responseCode?: number;
  readonly command?: string;

  constructor(source: unknown) {
    super('SMTP send failed.');
    this.name = 'SmtpSendError';
    const { code, responseCode, command } = (source ?? {}) as Record<string, unknown>;
    if (typeof code === 'string') this.code = code;
    if (typeof responseCode === 'number') this.responseCode = responseCode;
    if (typeof command === 'string') this.command = command;
  }
}

export class SmtpEmailChannel implements NotificationChannel {
  private readonly transport: SmtpTransport;

  constructor(
    private readonly config: SmtpEmailChannelConfig,
    private readonly log: JobLog,
    createTransport: SmtpTransportFactory = createNodemailerTransport,
  ) {
    this.transport = createTransport(transportOptions(config));
  }

  async send(envelope: NotificationEmailEnvelope): Promise<void> {
    let result: SmtpSendResult;
    try {
      result = await this.transport.sendMail({
        from: this.config.from,
        to: envelope.recipient_email,
        subject: envelope.summary,
        text: envelope.body ?? envelope.summary,
      });
    } catch (error) {
      // A rejected recipient arrives as a throw carrying the address in message/response/rejected;
      // pg-boss persists thrown errors, so rethrow only bounded diagnostics (no cause).
      throw new SmtpSendError(error);
    }

    if (result.rejected && result.rejected.length > 0) {
      throw new Error('SMTP server rejected one or more recipients.');
    }

    this.log.info('notification.email.smtp', {
      workspace_id: envelope.workspace_id,
      actor_id: envelope.actor_id,
      event_type: envelope.event_type,
      subject_id: envelope.subject_id,
      message_id: result.messageId,
    });
  }
}
