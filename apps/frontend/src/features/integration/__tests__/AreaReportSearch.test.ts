import { validateIntegrationCoverageSearch } from '@/routes/_authed/integration/coverage';
import { describe, expect, it } from 'vitest';

describe('Coverage report URL', () => {
  it('restores the Area tab, filter and opaque page while discarding invalid fields', () => {
    expect(
      validateIntegrationCoverageSearch({
        view: 'areas',
        'filter.analytics_area': 'unset',
        cursor: 'page-2',
        garbage: 'x',
      }),
    ).toMatchObject({
      view: 'areas',
      'filter.analytics_area': 'unset',
      cursor: 'page-2',
      garbage: undefined,
    });
    expect(
      validateIntegrationCoverageSearch({
        view: 'bad',
        'filter.analytics_area': 'bad',
        cursor: '',
      }),
    ).toMatchObject({ view: undefined, 'filter.analytics_area': undefined, cursor: undefined });
  });
});
