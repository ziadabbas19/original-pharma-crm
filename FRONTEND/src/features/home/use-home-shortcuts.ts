import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  accountUpdateHomeShortcuts,
  getAccountGetHomeShortcutsQueryKey,
  useAccountGetHomeShortcuts,
} from '@/api/generated/endpoints'
import type { HomeShortcutsDto } from '@/api/generated/model'
import { queryClient } from '@/app/query-client'
import { isPermanentRefusal } from '@/features/expenses/expense-queue'
import { handleError, normalizeError } from '@/lib/errors'
import { readCache, writeCache } from '@/lib/offline-cache'
import { store, useAppSelector } from '@/store'
import {
  defaultShortcutKeys,
  normalizeShortcutKeys,
  visibleShortcuts,
  type ShortcutDef,
  type ShortcutKey,
} from './shortcuts'

/** Last copy from the server, so Home shows the grid at once and offline. */
const CACHE_KEY = 'home-shortcuts'
/** A change not confirmed by the server yet (made offline, or still on its way). */
const PENDING_KEY = 'home-shortcuts-pending'
const QUERY_KEY = getAccountGetHomeShortcutsQueryKey()

interface Saved {
  userId: string
  /** null: nothing saved, the role's defaults apply. */
  keys: string[] | null
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function pendingRaw(): string {
  try {
    return localStorage.getItem(`op.cache.${PENDING_KEY}`) ?? ''
  } catch {
    return ''
  }
}

function readPending(): Saved | undefined {
  return readCache<Saved>(PENDING_KEY)?.data
}

function setPending(value: Saved | null) {
  if (value) writeCache(PENDING_KEY, value)
  else {
    try {
      localStorage.removeItem(`op.cache.${PENDING_KEY}`)
    } catch {
      // ignore
    }
  }
  notify()
}

let flushing: Promise<void> | null = null

/**
 * Sends the change waiting on this device. Kept for later when offline or the server has trouble; dropped
 * with a message when the server refuses it for good (then the server copy is shown again).
 */
export function flushHomeShortcuts(): Promise<void> {
  flushing ??= (async () => {
    // Changes made while one is on its way are sent after it, the latest last.
    for (;;) {
      const pending = readPending()
      const userId = store.getState().auth.user?.id
      if (!pending || pending.userId !== userId || !pending.keys) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      try {
        // A read that started before this change must not overwrite it when it lands.
        await queryClient.cancelQueries({ queryKey: QUERY_KEY })
        const saved = await accountUpdateHomeShortcuts({ keys: pending.keys })
        queryClient.setQueryData<HomeShortcutsDto>(QUERY_KEY, saved)
        writeCache<Saved>(CACHE_KEY, { userId: pending.userId, keys: saved.keys ?? null })
        if (JSON.stringify(readPending()?.keys) === JSON.stringify(pending.keys)) {
          setPending(null)
          return
        }
      } catch (error) {
        const failure = normalizeError(error)
        if (failure.status !== null && isPermanentRefusal(failure.status)) {
          setPending(null)
          handleError(failure, { context: 'shortcuts.save' })
          void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        }
        return
      }
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

export interface HomeShortcuts {
  /** The tiles to show, in order: saved or default keys the user may use. */
  tiles: ShortcutDef[]
  /** True while the role's defaults are shown (nothing saved). */
  isDefault: boolean
  /** First load on this device: no copy yet and the server has not answered (offline falls back to the defaults). */
  loading: boolean
  /** The role's default keys (for "Reset to default"). */
  defaults: ShortcutKey[]
  /** Applies at once on this device and sends it now or when back online. */
  save: (keys: ShortcutKey[]) => void
}

/** The signed-in user's Home shortcuts, saved on the server so they follow them to another phone. */
export function useHomeShortcuts(): HomeShortcuts {
  const userId = useAppSelector((s) => s.auth.user?.id) ?? ''
  const roles = useAppSelector((s) => s.auth.user?.roles)
  const granted = useAppSelector((s) => s.permissions.byKey)
  const copy = readCache<Saved>(CACHE_KEY)
  const mine = copy?.data.userId === userId ? copy : undefined
  const query = useAccountGetHomeShortcuts({
    query: {
      initialData: mine ? { keys: mine.data.keys, updatedAt: null } : undefined,
      initialDataUpdatedAt: mine?.savedAt,
      staleTime: 60_000,
    },
  })
  const raw = useSyncExternalStore(subscribe, pendingRaw, () => '')

  useEffect(() => {
    if (query.data && query.isFetchedAfterMount && !query.isError && userId)
      writeCache<Saved>(CACHE_KEY, { userId, keys: query.data.keys ?? null })
  }, [query.data, query.isFetchedAfterMount, query.isError, userId])

  // A change made offline goes out when the network is back (and on the next visit to Home).
  useEffect(() => {
    const run = () => void flushHomeShortcuts()
    window.addEventListener('online', run)
    run()
    return () => window.removeEventListener('online', run)
  }, [])

  return useMemo(() => {
    const pending = raw ? readPending() : undefined
    const local = pending?.userId === userId ? pending.keys : undefined
    // Straight from the cache: when a sent change is cleared, the server copy is already there even if
    // this render comes before the query's own update (no flash of the old list).
    const server = queryClient.getQueryData<HomeShortcutsDto>(QUERY_KEY) ?? query.data
    const saved = local !== undefined ? local : (server?.keys ?? null)
    const defaults = defaultShortcutKeys(roles?.map((r) => r.key) ?? [], granted)
    return {
      tiles: visibleShortcuts(saved ?? defaults, granted),
      isDefault: saved === null,
      loading: local === undefined && server === undefined && query.isPending,
      defaults,
      save: (keys: ShortcutKey[]) => {
        setPending({ userId, keys: normalizeShortcutKeys(keys) })
        void flushHomeShortcuts()
      },
    }
  }, [raw, userId, query.data, query.isPending, roles, granted])
}
