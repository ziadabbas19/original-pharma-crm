import { useEffect, useMemo } from 'react'
import { useRepHomeSettingsGetRepHome } from '@/api/generated/endpoints'
import type { RepHomeSettingsDto } from '@/api/generated/model'
import { readCache, writeCache } from '@/lib/offline-cache'
import { normalizeRepHome, type RepHomeConfig } from '../settings/rep-home-config'

const CACHE_KEY = 'rep-home'

/**
 * The Home layout chosen by the admin, read when the app opens. Offline or when the request fails, the
 * last copy on this device is used, and the defaults before the first successful read.
 */
export function useRepHomeConfig(): RepHomeConfig {
  const copy = readCache<RepHomeSettingsDto>(CACHE_KEY)
  const settings = useRepHomeSettingsGetRepHome({
    query: {
      initialData: copy?.data,
      initialDataUpdatedAt: copy?.savedAt,
      staleTime: 60_000,
      refetchOnMount: 'always',
      retry: 1,
    },
  })
  useEffect(() => {
    if (settings.data && settings.isFetchedAfterMount && !settings.isError)
      writeCache(CACHE_KEY, settings.data)
  }, [settings.data, settings.isFetchedAfterMount, settings.isError])
  return useMemo(() => normalizeRepHome(settings.data), [settings.data])
}
