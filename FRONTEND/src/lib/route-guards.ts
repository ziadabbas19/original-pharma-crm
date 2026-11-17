import { redirect } from '@tanstack/react-router'
import { bootstrapSession } from '@/lib/session'
import type { AppStore } from '@/store'

/** Route guard: restores the session once, then sends anonymous users to /login. */
export async function requireAuth(store: AppStore, href: string): Promise<void> {
  await bootstrapSession()
  if (store.getState().auth.status !== 'authenticated') {
    throw redirect({ to: '/login', search: { redirect: href } })
  }
}
