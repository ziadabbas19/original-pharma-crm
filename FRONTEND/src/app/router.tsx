import { createRouter } from '@tanstack/react-router'
import { FullPageSpinner } from '@/components/FullPageSpinner'
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
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
