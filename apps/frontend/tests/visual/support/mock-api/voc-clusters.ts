import {
  addVocClusterMemberRequestSchema,
  linkExistingFindingToVocClusterRequestSchema,
  vocClusterDtoSchema,
} from '@fops/shared';
import { memberFromCandidate } from '../../fixtures/voc-clusters';
import { errorEnvelope, json } from './shared';
import type { MockApiHandler, MockApiPathMatch } from './shared';

export function createVocClusterListHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/voc-clusters',
      handle: (route, context) =>
        json(
          route,
          context.scenario.list.status,
          context.scenario.list.status === 200
            ? { items: context.scenario.list.items }
            : errorEnvelope(context.scenario.list.status),
        ),
    },
  ];
}

export function createVocClusterDetailHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: /^\/voc-clusters\/([^/]+)\/candidate-peers$/,
      handle: (route, context, _url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Candidate peers path must include captures');
        return json(route, 200, context.scenario.candidates);
      },
    },
    {
      method: 'POST',
      path: /^\/voc-clusters\/([^/]+)\/vocs$/,
      handle: async (route, context, url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Add member path must include captures');
        const clusterId = pathMatch[1];
        const request = route.request();
        if (!clusterId) throw new Error(`Missing cluster id for ${request.method()} ${url}`);
        const body = addVocClusterMemberRequestSchema.parse(request.postDataJSON());
        context.postedBodies.push(body);
        const detail = context.scenario.details[clusterId];
        if (!detail?.cluster)
          throw new Error(`No mutable cluster fixture for ${request.method()} ${url}`);
        if (detail.cluster.members?.some((member) => member.voc_id === body.voc_id)) {
          throw new Error(`Candidate is already a member for ${request.method()} ${url}`);
        }
        detail.cluster = vocClusterDtoSchema.parse({
          ...detail.cluster,
          member_count: detail.cluster.member_count + 1,
          members: [...(detail.cluster.members ?? []), memberFromCandidate()],
        });
        await route.fulfill({ status: 204 });
      },
    },
    {
      method: 'POST',
      path: /^\/voc-clusters\/([^/]+)\/link-finding$/,
      handle: async (route, context, url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Link Finding path must include captures');
        const clusterId = pathMatch[1];
        const request = route.request();
        if (!clusterId) throw new Error(`Missing cluster id for ${request.method()} ${url}`);
        const body = linkExistingFindingToVocClusterRequestSchema.parse(request.postDataJSON());
        context.postedBodies.push(body);
        context.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        const detail = context.scenario.details[clusterId];
        const finding = context.scenario.findings.find(
          (candidate) => candidate.id === body.finding_id,
        );
        if (!detail?.cluster || !finding)
          throw new Error(`No linkable Finding fixture for ${request.method()} ${url}`);
        const linked = {
          id: finding.id,
          display_id: finding.display_id,
          status: finding.status,
        } as const;
        detail.cluster = vocClusterDtoSchema.parse({
          ...detail.cluster,
          linked_findings: [
            ...(detail.cluster.linked_findings ?? []).filter((item) => item.id !== finding.id),
            linked,
          ],
        });
        await json(route, 201, linked);
      },
    },
    {
      method: 'GET',
      path: /^\/voc-clusters\/([^/]+)$/,
      handle: (route, context, _url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Cluster detail path must include captures');
        const clusterId = pathMatch[1];
        if (!clusterId) throw new Error(`Missing cluster id for GET ${route.request().url()}`);
        const response = context.scenario.details[clusterId] ?? { status: 404 };
        return json(
          route,
          response.status,
          response.status === 200 ? response.cluster : errorEnvelope(response.status),
        );
      },
    },
  ];
}
