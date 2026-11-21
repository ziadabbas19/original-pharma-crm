import { createRouter } from '@tanstack/react-router'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { NotFound, RouteError } from '@/components/NotFound'
import { routeTree } from '@/routeTree.gen'
import { store, type AppStore } from '@/store'
import { queryClient } from './query-client'
import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  queryClient: QueryClient
  store: AppStore
}

export const router = createRouter({
  routeTree,
  context: { queryClient, store },
  defaultPreload: 'intent',
  defaultPendingComponent: FullPageSpinner,
  // Nested routes show the same screens inside their layout.
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
