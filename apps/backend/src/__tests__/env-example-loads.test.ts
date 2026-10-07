/**
 * #794 — the repo-root `.env.example`, copied as-is, must load.
 *
 * `env-example-completeness.test.ts` checks that every key is documented; this
 * checks the documented values parse. CI builds its env file from
 * `.env.example`, and a fresh clone copies it to `.env`, so an empty
 * placeholder (`KEY=`) that the schema rejects breaks both before any test runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

const ENV_EXAMPLE = path.resolve(__dirname, '../../../../.env.example');
const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

it('loads the repo-root .env.example as shipped', () => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const line of fs.readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key = '', raw = ''] = match;
    // Same result as `set -a; . .env.example` for the quoting the file uses.
    process.env[key] = /^".*"$/.test(raw) ? raw.slice(1, -1) : raw;
  }

  expect(() => loadConfig()).not.toThrow();
});
