import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useVocPreSubmitPeers', () => ({ useVocPreSubmitPeers: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiClient: vi.fn() }));

import { apiClient } from '@/lib/api';
import { useVocPreSubmitPeers } from '@/features/voc/hooks/useVocPreSubmitPeers';
import { SimilarVocPanel } from '../SimilarVocPanel';

const mockPeers = vi.mocked(useVocPreSubmitPeers);
const mockApiClient = vi.mocked(apiClient);
const peers = [
  { id: '11111111-1111-4111-8111-111111111111', display_id: 'VOC-293-ONE', title: '첫 번째 제목', created_at: '2026-08-01T00:00:00.000Z' },
  { id: '22222222-2222-4222-8222-222222222222', display_id: 'VOC-293-TWO', title: '두 번째 제목', created_at: '2026-08-02T00:00:00.000Z' },
  { id: '33333333-3333-4333-8333-333333333333', display_id: 'VOC-293-THREE', title: '세 번째 제목', created_at: '2026-08-03T00:00:00.000Z' },
];

// The component reads only `data` and `isError`, so the double is a partial
// UseQueryResult. The cast goes through `unknown` on purpose: asserting a
// partial straight to the full union is what TS2352 rejects.
type PeersResult = ReturnType<typeof useVocPreSubmitPeers>;
function peersResult(data: { items: typeof peers } | { items: [] } | undefined): PeersResult {
  return { data, isError: false } as unknown as PeersResult;
}

function renderPanel(managedSystemId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/vocs',
    // The marker is what makes the "renders nothing" assertions non-vacuous.
    // RouterProvider mounts asynchronously, so an empty document proves nothing
    // on its own — every test waits for the marker first, and only then is the
    // panel's absence evidence about the panel.
    component: () => (
      <>
        <span data-testid="router-mounted" />
        <SimilarVocPanel managedSystemId={managedSystemId} />
      </>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/vocs'] }),
  });
  return render(<RouterProvider router={router} />);
}

async function renderPanelMounted(managedSystemId?: string) {
  const result =
    managedSystemId === undefined ? renderPanel(undefined) : renderPanel(managedSystemId);
  await screen.findByTestId('router-mounted');
  return result;
}

describe('<SimilarVocPanel>', () => {
  afterEach(() => vi.clearAllMocks());

  test('3건을 title과 display_id로 렌더하고 두 번째 UUID로 이동하며 생성 요청이 없다', async () => {
    mockPeers.mockReturnValue(peersResult({ items: peers }));
    renderPanel();
    for (const peer of peers) {
      expect(await screen.findByText(peer.title)).toBeInTheDocument();
      expect(screen.getByText(peer.display_id, { exact: false })).toBeInTheDocument();
    }
    expect(screen.getByText('3건')).toBeInTheDocument();
    const secondLink = screen.getByRole('link', { name: /두 번째 제목/ });
    expect(secondLink.getAttribute('href')).toContain(peers[1]!.id);
    expect(secondLink.getAttribute('href')).not.toContain(peers[1]!.display_id);
    expect(secondLink.getAttribute('href')).not.toContain(peers[0]!.id);
    fireEvent.click(secondLink);
    expect(mockApiClient.mock.calls.filter(([method]) => method === 'POST' || method === 'PATCH')).toHaveLength(0);
  });

  test('0건은 정상 카드이며 unavailable/provider 경로를 렌더하지 않는다', async () => {
    mockPeers.mockReturnValue(peersResult({ items: [] }));
    await renderPanelMounted();
    expect(screen.getByText('유사 VOC')).toBeInTheDocument();
    expect(screen.getByText('0건')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText(/available|provider/i)).not.toBeInTheDocument();
  });

  test('MS 미선택이면 카드를 렌더하지 않는다', async () => {
    mockPeers.mockReturnValue(peersResult(undefined));
    await renderPanelMounted(undefined);
    expect(screen.queryByText('유사 VOC')).not.toBeInTheDocument();
  });

  test('응답 항목 수 2를 카운트로 쓴다', async () => {
    mockPeers.mockReturnValue(peersResult({ items: peers.slice(0, 2) }));
    await renderPanelMounted();
    expect(screen.getByText('2건')).toBeInTheDocument();
  });
});
