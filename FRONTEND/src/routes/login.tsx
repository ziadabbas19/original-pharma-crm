import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage } from '@/features/auth/LoginPage'
import { bootstrapSession } from '@/lib/session'

interface LoginSearch {
  redirect?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect:
      typeof search.redirect === 'string' && search.redirect.startsWith('/') ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context }) => {
    await bootstrapSession()
    if (context.store.getState().auth.status === 'authenticated') throw redirect({ to: '/' })
  },
  component: LoginPage,
})
