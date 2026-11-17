import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { canUseDashboard } from '@/lib/permissions'
import { requireAuth } from '@/lib/route-guards'

/** Dashboard route group (/admin). Child routes are code-split and loaded on demand. */
export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context.store, location.href)
    if (!canUseDashboard(context.store.getState().permissions.byKey)) throw redirect({ to: '/rep' })
  },
  component: AdminLayout,
})
