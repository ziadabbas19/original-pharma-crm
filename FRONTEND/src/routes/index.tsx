import { createFileRoute, redirect } from '@tanstack/react-router'
import { canUseDashboard } from '@/lib/permissions'
import { isNativePlatform } from '@/lib/platform'
import { requireAuth } from '@/lib/route-guards'

/** Entry point: the native app always opens the rep app; browsers pick by permissions. */
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context.store, location.href)
    const granted = context.store.getState().permissions.byKey
    throw redirect({ to: !isNativePlatform() && canUseDashboard(granted) ? '/admin' : '/rep' })
  },
})
