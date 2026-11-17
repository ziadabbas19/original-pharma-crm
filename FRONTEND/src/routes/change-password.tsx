import { createFileRoute } from '@tanstack/react-router'
import { ChangePasswordPage } from '@/features/profile/ChangePasswordPage'
import { requireAuth } from '@/lib/route-guards'

/** Shown after signing in with a temporary password (created or reset by someone else). */
export const Route = createFileRoute('/change-password')({
  beforeLoad: ({ context, location }) =>
    requireAuth(context.store, location.href, { allowTemporaryPassword: true }),
  component: ChangePasswordPage,
})
