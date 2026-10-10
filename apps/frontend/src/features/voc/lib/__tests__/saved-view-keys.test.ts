// #868: both saved-view directions read one key table, so a key dropped or
// renamed there must fail here — the filter object is pinned with `toEqual`.

import { describe, expect, it } from 'vitest';
import { savedViewFilterToVocSearch, vocSearchToSavedViewFilter } from '../saved-view-keys';

describe('VOC saved-view key translation', () => {
  it.each([
    ['managedSystem', 'managed_system_id'],
    ['tab', 'tab'],
    ['sort', 'sort'],
    ['q', 'q'],
    ['filter.severity', 'filter.severity'],
    ['filter.reporterStatus', 'filter.reporter_facing_status'],
    ['filter.owner', 'filter.owner'],
  ])('round-trips %s ↔ %s through the stored filter', (searchKey, filterKey) => {
    const value = `value:${searchKey}`;
    const search = { view: 'inbox', [searchKey]: value };

    const filter = vocSearchToSavedViewFilter(search, 'inbox');
    // Exact shape: a dropped or renamed key cannot pass.
    expect(filter).toEqual({ view: 'inbox', [filterKey]: value });

    expect(savedViewFilterToVocSearch(filter)).toEqual(search);
  });

  it('omits empty strings and non-string values going in; reading back keeps any string', () => {
    const search = {
      view: 'inbox',
      q: '',
      managedSystem: 42,
      'filter.severity': null,
      'filter.owner': undefined,
    };
    expect(vocSearchToSavedViewFilter(search, 'inbox')).toEqual({ view: 'inbox' });

    const filter = {
      view: 'inbox',
      q: '',
      managed_system_id: 42,
      'filter.reporter_facing_status': null,
      tab: undefined,
    };
    // Reading back keeps any string, including the empty one; non-strings drop.
    expect(savedViewFilterToVocSearch(filter)).toEqual({ view: 'inbox', q: '' });
  });

  it('falls back to the default view when view is missing, empty, or not a string', () => {
    expect(vocSearchToSavedViewFilter({}, 'inbox')).toEqual({ view: 'inbox' });
    expect(vocSearchToSavedViewFilter({ view: '' }, 'my')).toEqual({ view: 'my' });
    expect(vocSearchToSavedViewFilter({ view: 7 }, 'triage')).toEqual({ view: 'triage' });
  });
});
