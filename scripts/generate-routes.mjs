import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.join(repositoryRoot, 'apps/frontend');
const requireFromFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const routerPluginEntry = requireFromFrontend.resolve('@tanstack/router-plugin/vite');
const requireFromRouterPlugin = createRequire(
  path.resolve(routerPluginEntry, '../../..', 'package.json'),
);
const { Generator, getConfig } = requireFromRouterPlugin('@tanstack/router-generator');

const config = getConfig({}, frontendRoot);
const generator = new Generator({ config, root: frontendRoot });

await generator.run();
