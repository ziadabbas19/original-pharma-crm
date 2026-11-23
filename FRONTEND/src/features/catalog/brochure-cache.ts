import { apiFetchBlob } from '@/lib/api-client'

/**
 * Brochure pages are read with the user's session and kept in the browser's Cache Storage once opened,
 * so the rep app can show them offline. A page never changes (a new upload gets a new address), so the
 * kept copy is used first. Where Cache Storage is missing, the pages are simply loaded each time.
 */
const CACHE_NAME = 'op-brochures'

const storage = (): CacheStorage | undefined => (typeof caches === 'undefined' ? undefined : caches)

export async function loadBrochurePage(url: string): Promise<Blob> {
  const cache = await storage()
    ?.open(CACHE_NAME)
    .catch(() => undefined)
  const kept = await cache?.match(url).catch(() => undefined)
  if (kept) return kept.blob()
  const blob = await apiFetchBlob(url)
  await cache?.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => undefined)
  return blob
}

/** Drop the kept pages on sign-out. */
export function clearBrochurePages(): void {
  void storage()
    ?.delete(CACHE_NAME)
    .catch(() => undefined)
}
