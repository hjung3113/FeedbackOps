import type * as React from 'react';

import { COMMAND_PALETTE_COPY } from '@/lib/copy/command-palette';
import { RAIL_ITEMS, type RailDomain } from '@/lib/layout/AppRail';
import type { SidebarNavEntry } from '@/lib/layout/AppSidebar';

// #611 first-version commands, derived from the existing nav sources
// (AppRail.RAIL_ITEMS + routes/_authed.tsx NAV_TREE) so labels and hrefs never
// drift from the visible UI. Out of scope on purpose: Managed System scope
// switching, recent records, global record search. VOC create is the only
// create verb (decision 4).

export interface PaletteCommandDescriptor {
  id: string;
  group: 'navigate' | 'create';
  verb: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export type PaletteNavTree = Record<Exclude<RailDomain, 'home'>, SidebarNavEntry[]>;

/** VOC create has its own group; the sidebar's create entry must not double up in 이동. */
const VOC_CREATE_HREF = '/vocs?action=create';

export function buildPaletteCommands({
  navTree,
  canAccessWorkspaceAdmin,
}: {
  navTree: PaletteNavTree;
  canAccessWorkspaceAdmin: boolean;
}): PaletteCommandDescriptor[] {
  const commands: PaletteCommandDescriptor[] = [];
  const commandIndexByHref = new Map<string, number>();
  const treeLabelHrefs = new Set<string>();
  const push = (command: PaletteCommandDescriptor, fromTree = false) => {
    const existingIndex = commandIndexByHref.get(command.href);
    if (existingIndex !== undefined) {
      if (fromTree && !treeLabelHrefs.has(command.href)) {
        const existing = commands[existingIndex];
        if (existing) commands[existingIndex] = { ...existing, label: command.label };
        treeLabelHrefs.add(command.href);
      }
      return;
    }
    commandIndexByHref.set(command.href, commands.length);
    if (fromTree) treeLabelHrefs.add(command.href);
    commands.push(command);
  };

  for (const item of RAIL_ITEMS) {
    if (item.key === 'admin' && !canAccessWorkspaceAdmin) continue;
    const Icon = item.icon;
    push({
      id: `nav-rail-${item.key}`,
      group: 'navigate',
      verb: COMMAND_PALETTE_COPY.verbs.navigate,
      label: item.label,
      href: item.href,
      icon: <Icon className="h-3.5 w-3.5" />,
    });
  }

  for (const domain of Object.keys(navTree) as Array<keyof PaletteNavTree>) {
    // ADR-0056: Admin discovery is capability-based, same gate the sidebar uses.
    if (domain === 'admin' && !canAccessWorkspaceAdmin) continue;
    const railItem = RAIL_ITEMS.find((item) => item.key === domain);
    if (!railItem) continue;
    for (const entry of navTree[domain]) {
      if (entry.href === VOC_CREATE_HREF) continue;
      let entryLabel = entry.label;
      if (entryLabel === railItem.label) {
        const view = new URLSearchParams(entry.href.split('?')[1] ?? '').get('view');
        // NAV_TREE reuses the rail's generic Tasks label for its board route;
        // the route's own view key supplies the specific label shown in the prototype.
        if (view === 'board') entryLabel = 'Board';
      }
      const label =
        entryLabel === railItem.label ? railItem.label : `${railItem.label} · ${entryLabel}`;
      push(
        {
          id: `nav-${entry.id}`,
          group: 'navigate',
          verb: COMMAND_PALETTE_COPY.verbs.navigate,
          label,
          href: entry.href,
          ...(entry.icon !== undefined ? { icon: entry.icon } : {}),
        },
        true,
      );
    }
  }

  push({
    id: 'create-voc',
    group: 'create',
    verb: COMMAND_PALETTE_COPY.verbs.create,
    label: COMMAND_PALETTE_COPY.createVocLabel,
    href: VOC_CREATE_HREF,
  });

  return commands;
}
