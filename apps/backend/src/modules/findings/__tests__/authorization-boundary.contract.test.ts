import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const findingsAuthorizationPath = fileURLToPath(new URL('../authorization.ts', import.meta.url));
const entityLinksServicePath = fileURLToPath(
  new URL('../../entity-links/service.ts', import.meta.url),
);
const vocClustersServicePath = fileURLToPath(
  new URL('../../voc-clusters/service.ts', import.meta.url),
);
const taskRequestsServicePath = fileURLToPath(
  new URL('../../task-requests/service.ts', import.meta.url),
);
const tasksServicePath = fileURLToPath(new URL('../../tasks/service.ts', import.meta.url));

describe('Finding authorization boundary (#169)', () => {
  it('makes all five Finding authorization consumers import the canonical predicates', async () => {
    const [authorization, entityLinks, vocClusters, taskRequests, tasks] = await Promise.all([
      readFile(findingsAuthorizationPath, 'utf8'),
      readFile(entityLinksServicePath, 'utf8'),
      readFile(vocClustersServicePath, 'utf8'),
      readFile(taskRequestsServicePath, 'utf8'),
      readFile(tasksServicePath, 'utf8'),
    ]);

    expect(authorization).toContain('export async function actorFindingReadScope');
    expect(authorization).toContain('export async function checkFindingManage');

    for (const consumer of [entityLinks, vocClusters, taskRequests, tasks]) {
      expect(consumer).toContain("from '../findings/authorization.js'");
      expect(consumer).not.toMatch(
        /checkCapability\([\s\S]{0,160}['"]finding\.(?:read|manage)['"]/,
      );
      expect(consumer).not.toMatch(/function actorFindingReadScope/);
    }

    expect(taskRequests).not.toMatch(/function canManage(?:Finding|VocClusterSource)/);
    expect(tasks).not.toMatch(/function canManageFinding/);
  });
});
