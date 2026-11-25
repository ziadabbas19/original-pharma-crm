/**
 * Last good copy of small reference lists (catalog, collection methods, doctors) so the rep app
 * can still open the order form offline. Per device, in localStorage; failures are ignored.
 */
const PREFIX = 'op.cache.'

/**
 * `owner` ties a copy to who it was loaded for (for example the user and their grants version);
 * a copy saved for someone else is ignored.
 */
export function readCache<T>(key: string, owner?: string): { data: T; savedAt: number } | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const copy = JSON.parse(raw) as { data: T; savedAt: number; owner?: string }
    if (owner !== undefined && copy.owner !== owner) return undefined
    return copy
  } catch {
    return undefined
  }
}

export function writeCache<T>(key: string, data: T, owner?: string): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now(), owner }))
  } catch {
    // Quota or private mode: the app still works online.
  }
}

/** Drop cached lists on sign-out: they belong to the previous user. */
export function clearCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}
