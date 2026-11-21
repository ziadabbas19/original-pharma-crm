import { createFileRoute, redirect } from '@tanstack/react-router'
import { canUseDashboard } from '@/lib/permissions'
import { requireAuth } from '@/lib/route-guards'

/**
 * Entry point, the same in the browser and the Android app: people who manage others get the
 * management screens (with their own field work under More when they have it), everyone else the
 * rep app.
 */
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context.store, location.href)
    const granted = context.store.getState().permissions.byKey
    throw redirect({ to: canUseDashboard(granted) ? '/admin' : '/rep' })
  },
})
