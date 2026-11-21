import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { handleError, normalizeError } from '@/lib/errors'

/**
 * Failed requests go through the central error handler:
 * - queries toast only when the screen has no cached data to fall back on (a failed background
 *   refresh keeps the last data on screen quietly);
 * - mutations always toast, unless the call says `meta: { silent: true }` because the screen shows
 *   the error itself (forms show it inline).
 * Per-call `meta.context` names the place in development logs.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const silent = query.meta?.silent === true || query.state.data !== undefined
      handleError(error, { silent, context: query.meta?.context ?? String(query.queryKey[0] ?? '') })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      handleError(error, { silent: mutation.meta?.silent === true, context: mutation.meta?.context })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Only failures that can fix themselves are retried (network, timeouts, rate limits, 5xx).
      retry: (failureCount, error) => normalizeError(error).retryable && failureCount < 2,
    },
    // Offline, a change fails at once with the "no connection" message instead of waiting silently.
    // (The rep app's visits and orders have their own offline queue and do not go through here.)
    mutations: { retry: false, networkMode: 'always' },
  },
})

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silent?: boolean; context?: string }
    mutationMeta: { silent?: boolean; context?: string }
  }
}
