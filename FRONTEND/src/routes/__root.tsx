import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { RouterContext } from '@/app/router'
import { NotFound, RouteError } from '@/components/NotFound'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
})
