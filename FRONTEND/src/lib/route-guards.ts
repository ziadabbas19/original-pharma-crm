import { redirect } from '@tanstack/react-router'
import { bootstrapSession } from '@/lib/session'
import type { AppStore } from '@/store'

/**
 * Route guard: restores the session once, then sends anonymous users to /login and users
 * with a temporary password to /change-password.
 */
export async function requireAuth(
  store: AppStore,
  href: string,
  options: { allowTemporaryPassword?: boolean } = {},
): Promise<void> {
  await bootstrapSession()
  const { auth } = store.getState()
  if (auth.status !== 'authenticated') {
    throw redirect({ to: '/login', search: { redirect: href } })
  }
  if (auth.user?.mustChangePassword && !options.allowTemporaryPassword) {
    throw redirect({ to: '/change-password' })
  }
}
