import type { QueryClient } from '@tanstack/react-query'

/**
 * Refreshes every cached request under the given API paths. Generated query keys start with the full
 * URL ("/api/lookups/specialties", "/api/orders/123"), so a plain key prefix would miss them.
 */
export function invalidateApi(queryClient: QueryClient, ...paths: string[]): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0]
      return typeof root === 'string' && paths.some((path) => root === path || root.startsWith(`${path}/`))
    },
  })
}
