import { useForm } from '@tanstack/react-form'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api-client'
import { login } from '@/lib/session'

const route = getRouteApi('/login')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { redirect } = route.useSearch()
  const [error, setError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await login(value.email.trim(), value.password)
        await navigate({ to: redirect ?? '/' })
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'generic'
        setError(t([`auth.errors.${code}`, 'auth.errors.generic']))
      }
    },
  })

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 p-4 pt-safe pb-safe">
      <div className="flex w-full max-w-sm items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-8" />
          {t('common.appName')}
        </div>
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t('auth.title')}</CardTitle>
          <CardDescription>{t('auth.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) =>
                  !value
                    ? t('auth.required')
                    : !EMAIL.test(value.trim())
                      ? t('auth.invalidEmail')
                      : undefined,
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>{t('auth.email')}</Label>
                  <Input
                    id={field.name}
                    type="email"
                    dir="ltr"
                    autoComplete="username"
                    inputMode="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-destructive">{field.state.meta.errors.join(', ')}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{ onBlur: ({ value }) => (!value ? t('auth.required') : undefined) }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>{t('auth.password')}</Label>
                  <Input
                    id={field.name}
                    type="password"
                    dir="ltr"
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-destructive">{field.state.meta.errors.join(', ')}</p>
                  )}
                </div>
              )}
            </form.Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" size="lg" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
