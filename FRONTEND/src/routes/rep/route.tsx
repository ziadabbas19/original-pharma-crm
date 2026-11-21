import { createFileRoute, redirect } from '@tanstack/react-router'
import { RepLayout } from '@/components/layout/RepLayout'
import { canUseDashboard, canUseFieldApp } from '@/lib/permissions'
import { requireAuth } from '@/lib/route-guards'

/** Rep app route group (/rep), mobile-first. Child routes are code-split and loaded on demand. */
export const Route = createFileRoute('/rep')({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context.store, location.href)
    // Managers without field work have nothing here; their phone opens the management screens.
    const granted = context.store.getState().permissions.byKey
    if (!canUseFieldApp(granted) && canUseDashboard(granted)) throw redirect({ to: '/admin' })
  },
  component: RepLayout,
})
