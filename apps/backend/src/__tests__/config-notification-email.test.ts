import { afterEach, describe, expect, it } from 'vitest';
import { ZodError, type ZodIssue } from 'zod';

import { loadConfig } from '../config.js';

const originalEnvironment = { ...process.env };
const DISTINCTIVE_SECRET = 'notification-smtp-secret-must-not-leak';

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

function loadWithEnvironment(overrides: Record<string, string> = {}) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: 'test',
    AUTH_PROVIDER: 'mock',
    ...overrides,
  });
  return loadConfig();
}

function configIssues(env: Record<string, string>): ZodIssue[] {
  try {
    loadWithEnvironment(env);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues;
  }
  throw new Error('Expected the environment to fail config validation.');
}

type SmtpEnvironmentOverrides = Partial<
  Record<
    | 'NOTIFICATION_EMAIL_CHANNEL'
    | 'SMTP_HOST'
    | 'SMTP_PORT'
    | 'SMTP_FROM'
    | 'SMTP_USERNAME'
    | 'SMTP_PASSWORD',
    string
  >
>;

function smtpEnvironment(overrides: SmtpEnvironmentOverrides = {}): Record<string, string> {
  const env: Record<string, string> = {
    NOTIFICATION_EMAIL_CHANNEL: 'smtp',
    SMTP_HOST: 'relay.example.test',
    SMTP_PORT: '587',
    SMTP_FROM: 'notifications@example.test',
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

describe('notification email configuration', () => {
  it('defaults to mock without SMTP settings and treats blank template values as unset', () => {
    const config = loadWithEnvironment({
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_USERNAME: '',
      SMTP_PASSWORD: '',
      SMTP_FROM: '',
    });

    expect(config.NOTIFICATION_EMAIL_CHANNEL).toBe('mock');
    expect(config.SMTP_HOST).toBeUndefined();
    expect(config.SMTP_PORT).toBeUndefined();
    expect(config.SMTP_USERNAME).toBeUndefined();
    expect(config.SMTP_PASSWORD).toBeUndefined();
    expect(config.SMTP_FROM).toBeUndefined();
  });

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'])(
    'requires %s when SMTP is selected',
    (variable) => {
      const env = smtpEnvironment();
      delete env[variable];

      expect(configIssues(env)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: [variable],
            message: `${variable} is required when NOTIFICATION_EMAIL_CHANNEL=smtp`,
          }),
        ]),
      );
    },
  );

  it('coerces the port and permits an unauthenticated internal relay', () => {
    const config = loadWithEnvironment(smtpEnvironment());

    expect(config.NOTIFICATION_EMAIL_CHANNEL).toBe('smtp');
    expect(config.SMTP_PORT).toBe(587);
    expect(config.SMTP_USERNAME).toBeUndefined();
    expect(config.SMTP_PASSWORD).toBeUndefined();
  });

  it('accepts credentials when both are set', () => {
    const config = loadWithEnvironment(
      smtpEnvironment({ SMTP_USERNAME: 'relay-user', SMTP_PASSWORD: DISTINCTIVE_SECRET }),
    );

    expect(config.SMTP_USERNAME).toBe('relay-user');
    expect(config.SMTP_PASSWORD).toBe(DISTINCTIVE_SECRET);
  });

  it.each([
    {
      label: 'SMTP_USERNAME without SMTP_PASSWORD',
      overrides: { SMTP_USERNAME: 'relay-user' },
      secret: undefined,
    },
    {
      label: 'SMTP_PASSWORD without SMTP_USERNAME',
      overrides: { SMTP_PASSWORD: DISTINCTIVE_SECRET },
      secret: DISTINCTIVE_SECRET,
    },
  ])('rejects $label without echoing a credential', ({ overrides, secret }) => {
    const serialized = JSON.stringify(configIssues(smtpEnvironment(overrides)));

    expect(serialized).toContain('SMTP_USERNAME');
    expect(serialized).toContain('SMTP_PASSWORD');
    if (secret) expect(serialized).not.toContain(secret);
  });
});
