// #868: one key table for VOC saved views — the /vocs route-search key and the
// stored filter key for every translatable pair. Both directions iterate this
// table, so a new saved-view key is a single edit here instead of two
// hand-written mappings (#849 had to keep them in sync by hand).

export const VOC_SAVED_VIEW_KEYS = [
  { search: 'managedSystem', filter: 'managed_system_id' },
  { search: 'tab', filter: 'tab' },
  { search: 'sort', filter: 'sort' },
  { search: 'q', filter: 'q' },
  { search: 'filter.severity', filter: 'filter.severity' },
  { search: 'filter.reporterStatus', filter: 'filter.reporter_facing_status' },
  { search: 'filter.owner', filter: 'filter.owner' },
] as const;

/** /vocs route search → stored saved-view filter. `defaultView` comes from the
 * route layer (`VOC_DEFAULT_VIEW`) so this module does not import `routes/`. */
export function vocSearchToSavedViewFilter(
  search: Record<string, unknown>,
  defaultView: string,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const view = search.view;
  filter.view = typeof view === 'string' && view !== '' ? view : defaultView;
  for (const { search: searchKey, filter: filterKey } of VOC_SAVED_VIEW_KEYS) {
    const value = search[searchKey];
    if (typeof value === 'string' && value !== '') filter[filterKey] = value;
  }
  return filter;
}

/** Stored saved-view filter → /vocs route search. `view` is copied as is. */
export function savedViewFilterToVocSearch(
  filter: Record<string, unknown>,
): Record<string, unknown> {
  const search: Record<string, unknown> = { view: filter.view };
  for (const { search: searchKey, filter: filterKey } of VOC_SAVED_VIEW_KEYS) {
    const value = filter[filterKey];
    if (typeof value === 'string') search[searchKey] = value;
  }
  return search;
}
