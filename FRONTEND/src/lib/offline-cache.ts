/**
 * Last good copy of small reference lists (catalog, collection methods, doctors) so the rep app
 * can still open the order form offline. Per device, in localStorage; failures are ignored.
 */
const PREFIX = 'op.cache.'

export function readCache<T>(key: string): { data: T; savedAt: number } | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    return JSON.parse(raw) as { data: T; savedAt: number }
  } catch {
    return undefined
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }))
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
