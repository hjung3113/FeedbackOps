import { vocClusterSuggestionItemSchema } from '@fops/shared';
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import { VocClusterMemberRow } from '../detail/VocClusterMemberRow';
import { ClusterSuggestionPanel } from './ClusterSuggestionPanel';

it('links each VOC to the shipped member-row inbox selection', () => {
  const root = createRootRoute();
  const vocs = createRoute({ getParentRoute: () => root, path: '/vocs' });
  const router = createRouter({
    routeTree: root.addChildren([vocs]),
    history: createMemoryHistory({ initialEntries: ['/vocs'] }),
  });
  const item = vocClusterSuggestionItemSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    primary_managed_system_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    revision: 3,
    embedding_version: 2,
    source_hashes: ['hash-a', 'hash-b'],
    vocs: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        display_id: 'VOC-12',
        title: '첫 번째 문의',
        description_rich_content: null,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        display_id: 'VOC-34',
        title: '두 번째 문의',
        description_rich_content: null,
      },
    ],
  });
  render(
    <RouterContextProvider router={router}>
      <ClusterSuggestionPanel
        item={item}
        notice={null}
        noticeId={0}
        fallbackRef={createRef<HTMLDivElement>()}
        pending={false}
        blocked={false}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
        onReload={vi.fn()}
      />
      <VocClusterMemberRow
        member={{
          voc_id: item.vocs[0].id,
          title: '기존 member 링크',
          added_by: '50000000-0000-4000-8000-000000000005',
          added_at: '2026-10-14T00:00:00.000Z',
        }}
        last
        canRemove={false}
        onRemove={vi.fn()}
        isRemoving={false}
      />
    </RouterContextProvider>,
  );
  expect(screen.getByRole('link', { name: 'VOC-12' })).toHaveAttribute(
    'href',
    '/vocs?view=inbox&selected=22222222-2222-4222-8222-222222222222',
  );
  expect(screen.getByRole('link', { name: 'VOC-34' })).toHaveAttribute(
    'href',
    '/vocs?view=inbox&selected=33333333-3333-4333-8333-333333333333',
  );
  expect(screen.getByRole('link', { name: 'VOC-12' }).getAttribute('href')).toBe(
    screen.getByRole('link', { name: '기존 member 링크' }).getAttribute('href'),
  );
});
