import { describe, expect, it } from 'vitest';

import type { JobLog } from '../../../lib/job-log.js';
import type { NotificationEmailEnvelope } from '../channels.js';
import { SmtpEmailChannel } from '../smtp.js';

interface SmtpConfig {
  host: string;
  port: number;
  from: string;
  username?: string | undefined;
  password?: string | undefined;
}

interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

interface SendResult {
  messageId?: string;
  rejected?: unknown[];
}

const smtpConfig: SmtpConfig = {
  host: 'relay.example.test',
  port: 587,
  from: 'notifications@example.test',
  username: 'relay-user',
  password: 'private-password',
};

const envelope: NotificationEmailEnvelope = {
  workspace_id: 'workspace-1',
  actor_id: 'actor-1',
  event_type: 'voc.severity_set_high_or_critical',
  subject_type: 'voc',
  subject_id: 'subject-1',
  locale: 'ko-KR',
  summary: 'VOC의 심각도가 높음으로 변경되었습니다.',
  body: '본문 내용입니다.',
  in_app: true,
  email: true,
  recipient_email: 'recipient@example.test',
};

function createLog() {
  const entries: Array<{ message: string; fields?: Record<string, unknown> | undefined }> = [];
  const log: JobLog = {
    info: (message, fields) => entries.push({ message, fields }),
    warn: () => {},
    error: () => {},
  };
  return { log, entries };
}

function createChannel(
  config: SmtpConfig,
  sendMail: (message: MailMessage) => Promise<SendResult>,
  capturedOptions?: { value: unknown },
) {
  const { log, entries } = createLog();
  const channel = new SmtpEmailChannel(config, log, (options) => {
    if (capturedOptions) capturedOptions.value = options;
    return { sendMail };
  });
  return { channel, entries };
}

describe('SmtpEmailChannel', () => {
  it('sends the configured sender, recipient, Korean summary, and optional body as plain text', async () => {
    const sent: MailMessage[] = [];
    const { channel, entries } = createChannel(smtpConfig, async (message) => {
      sent.push(message);
      return { messageId: '<smtp-message-1>', rejected: [] };
    });

    await channel.send(envelope);

    expect(sent).toEqual([
      {
        from: 'notifications@example.test',
        to: 'recipient@example.test',
        subject: 'VOC의 심각도가 높음으로 변경되었습니다.',
        text: '본문 내용입니다.',
      },
    ]);
    expect(entries).toEqual([
      {
        message: 'notification.email.smtp',
        fields: {
          workspace_id: 'workspace-1',
          actor_id: 'actor-1',
          event_type: 'voc.severity_set_high_or_critical',
          subject_id: 'subject-1',
          message_id: '<smtp-message-1>',
        },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain(envelope.recipient_email);
  });

  it('uses the summary when the envelope has no body', async () => {
    const sent: MailMessage[] = [];
    const { channel } = createChannel(smtpConfig, async (message) => {
      sent.push(message);
      return { messageId: '<smtp-message-2>', rejected: [] };
    });

    const { body: _body, ...envelopeWithoutBody } = envelope;
    await channel.send(envelopeWithoutBody);

    expect(sent[0]).toEqual({
      from: 'notifications@example.test',
      to: 'recipient@example.test',
      subject: envelope.summary,
      text: envelope.summary,
    });
  });

  it.each([
    [465, true, false],
    [587, false, true],
  ] as const)(
    'on port %s uses secure=%s and requireTLS=%s with credentials and bounded timeouts',
    async (port, secure, requireTLS) => {
      const capturedOptions: { value: unknown } = { value: undefined };
      const { channel } = createChannel(
        { ...smtpConfig, port },
        async () => ({ messageId: '<smtp-message>', rejected: [] }),
        capturedOptions,
      );

      await channel.send(envelope);

      expect(capturedOptions.value).toMatchObject({
        host: 'relay.example.test',
        port,
        secure,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        auth: { user: 'relay-user', pass: 'private-password' },
      });
      expect(Object.hasOwn(capturedOptions.value as object, 'requireTLS')).toBe(requireTLS);
    },
  );

  it('omits auth options when relay credentials are unset', async () => {
    const capturedOptions: { value: unknown } = { value: undefined };
    const { channel } = createChannel(
      { ...smtpConfig, username: undefined, password: undefined },
      async () => ({ messageId: '<smtp-message>', rejected: [] }),
      capturedOptions,
    );

    await channel.send(envelope);

    expect(capturedOptions.value).not.toHaveProperty('auth');
  });

  it('rethrows transport failures without the recipient or relay response', async () => {
    const transportError = Object.assign(
      new Error(`550 5.1.1 <${envelope.recipient_email}>: Recipient address rejected`),
      {
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        response: `550 <${envelope.recipient_email}> unknown`,
        rejected: [envelope.recipient_email],
        rejectedErrors: [{ recipient: envelope.recipient_email }],
      },
    );
    const { channel } = createChannel(smtpConfig, async () => {
      throw transportError;
    });

    const thrown = await channel.send(envelope).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
    const exposed = JSON.stringify(thrown, Object.getOwnPropertyNames(thrown));
    expect(exposed).not.toContain(envelope.recipient_email);
    expect((thrown as Error).cause).toBeUndefined();
  });

  it('throws when the relay accepts only part of the recipient set', async () => {
    const { channel, entries } = createChannel(smtpConfig, async () => ({
      messageId: '<smtp-message-3>',
      rejected: ['recipient@example.test'],
    }));

    await expect(channel.send(envelope)).rejects.toThrow(
      'SMTP server rejected one or more recipients.',
    );
    expect(JSON.stringify(entries)).not.toContain(envelope.recipient_email);
  });
});
