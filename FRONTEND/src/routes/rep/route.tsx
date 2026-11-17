import { createFileRoute } from '@tanstack/react-router'
import { RepLayout } from '@/components/layout/RepLayout'
import { requireAuth } from '@/lib/route-guards'

/** Rep app route group (/rep), mobile-first. Child routes are code-split and loaded on demand. */
export const Route = createFileRoute('/rep')({
  beforeLoad: ({ context, location }) => requireAuth(context.store, location.href),
  component: RepLayout,
})
