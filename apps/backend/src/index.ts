// Backend runtime entry. Wires the fops_app DB pool (DATABASE_URL) into
// `buildServer` and starts listening. The migrate-role connection
// (DATABASE_URL_MIGRATE) is never imported here — only drizzle-kit and the
// seed script touch it (ADR-0008).

import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { buildServer } from './server.js';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL is required to start the backend (fops_app role).');
  process.exit(1);
}

const dbHandle = createDb(config.DATABASE_URL);
const app = await buildServer({ config, dbHandle });

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  await dbHandle.close();
  process.exit(1);
}
