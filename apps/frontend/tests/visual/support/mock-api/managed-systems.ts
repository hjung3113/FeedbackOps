import {
  managedSystemDefaultCandidatesSchema,
  managedSystemDefaultDiagnosticsSchema,
} from '@fops/shared';
import {
  managedSystemDiagnostics,
  managedSystemDiagnosticsList,
  managedSystemOwnerCandidates,
  managedSystemOwnerList,
} from '../../fixtures/managed-system-owner';
import { railScopeManagedSystems } from '../../fixtures/rail-scope';
import { managedSystems } from '../../fixtures/voc-clusters';
import { vocCreateManagedSystems } from '../../fixtures/voc-create';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

export function createManagedSystemHandlers(context: MockApiContext): MockApiHandler[] {
  return [
    // The populated diagnostics registry also loads the Analytics Area mapping list.
    ...(context.options.managedSystemDiagnostics
      ? [
          {
            method: 'GET',
            path: '/analytics-areas',
            handle: (route) => json(route, 200, { items: [] }),
          } satisfies MockApiHandler,
        ]
      : []),
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
      handle: (route, context) =>
        json(
          route,
          200,
          context.options.managedSystemDiagnostics
            ? managedSystemDiagnostics
            : managedSystemDefaultDiagnosticsSchema.parse({ items: [] }),
        ),
    },
    {
      method: 'GET',
      path: '/managed-systems',
      handle: (route, context) =>
        json(
          route,
          200,
          context.options.managedSystemDiagnostics
            ? managedSystemDiagnosticsList
            : context.options.vocCreate
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
