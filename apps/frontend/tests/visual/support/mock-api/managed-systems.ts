import {
  managedSystemDefaultCandidatesSchema,
  managedSystemDefaultDiagnosticsSchema,
} from '@fops/shared';
import {
  managedSystemOwnerCandidates,
  managedSystemOwnerList,
} from '../../fixtures/managed-system-owner';
import { railScopeManagedSystems } from '../../fixtures/rail-scope';
import { managedSystems } from '../../fixtures/voc-clusters';
import { vocCreateManagedSystems } from '../../fixtures/voc-create';
import { json } from './shared';
import type { MockApiHandler } from './shared';

export function createManagedSystemHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/managed-systems/default-candidates',
      handle: (route, context) =>
        json(
          route,
          200,
          context.options.managedSystemOwner
            ? managedSystemOwnerCandidates
            : managedSystemDefaultCandidatesSchema.parse({ owners: [], reviewers: [] }),
        ),
    },
    {
      method: 'GET',
      path: '/managed-systems/default-diagnostics',
      handle: (route) =>
        json(route, 200, managedSystemDefaultDiagnosticsSchema.parse({ items: [] })),
    },
    {
      method: 'GET',
      path: '/managed-systems',
      handle: (route, context) =>
        json(
          route,
          200,
          context.options.vocCreate
            ? vocCreateManagedSystems
            : context.options.managedSystemOwner
              ? managedSystemOwnerList
              : context.options.railScope
                ? railScopeManagedSystems
                : managedSystems,
        ),
    },
  ];
}
