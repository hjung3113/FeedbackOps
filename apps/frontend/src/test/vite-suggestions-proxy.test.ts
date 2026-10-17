// @vitest-environment node
import { expect, it } from 'vitest';
import config from '../../vite.config';

it('proxies the backend-only suggestion resource and preserves Cluster HTML navigation', () => {
  const proxy = config.server?.proxy;
  expect(proxy?.['/voc-cluster-suggestions']).toBe('http://127.0.0.1:3011');
  const clusters = proxy?.['/voc-clusters'];
  if (!clusters || typeof clusters === 'string')
    throw new Error('Cluster proxy must preserve bypass');
  expect(
    clusters.bypass?.(
      { headers: { accept: 'text/html' }, url: '/voc-clusters' } as never,
      {} as never,
      {} as never,
    ),
  ).toBe('/voc-clusters');
});
