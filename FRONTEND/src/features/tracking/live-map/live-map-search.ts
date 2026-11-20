/**
 * URL state of the live map, so other pages can link to a rep: ?rep=<userId> opens that rep's panel,
 * &day=yyyy-mm-dd shows that day's route and &at=<ISO time> marks the point recorded then.
 */
export interface LiveMapSearch {
  rep?: string
  day?: string
  at?: string
}

export function validateLiveMapSearch(search: Record<string, unknown>): LiveMapSearch {
  const day =
    typeof search.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.day) ? search.day : undefined
  const at = typeof search.at === 'string' && !Number.isNaN(Date.parse(search.at)) ? search.at : undefined
  return { rep: typeof search.rep === 'string' && search.rep ? search.rep : undefined, day, at }
}
