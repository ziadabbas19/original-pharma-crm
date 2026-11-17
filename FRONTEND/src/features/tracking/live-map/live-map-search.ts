/** URL state of the live map (?rep=<userId> opens that rep's panel), so other pages can link to a rep. */
export interface LiveMapSearch {
  rep?: string
}

export function validateLiveMapSearch(search: Record<string, unknown>): LiveMapSearch {
  return { rep: typeof search.rep === 'string' && search.rep ? search.rep : undefined }
}
