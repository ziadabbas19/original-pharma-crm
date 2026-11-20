import { useForm } from '@tanstack/react-form'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '@/components/BrandLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-4 pt-safe pb-safe">
      <div className="flex w-full max-w-md items-center justify-end gap-1">
        <ThemeSwitcher compact />
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md gap-6 py-8" data-testid="login-card">
        <CardHeader className="justify-items-center gap-3 px-6 text-center sm:px-8">
          <BrandLogo className="mb-2 h-20" />
          <CardTitle className="text-2xl font-bold">{t('auth.title')}</CardTitle>
          <CardDescription className="text-[15px]">{t('auth.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8">
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
                <Button type="submit" size="lg" className="mt-1 w-full" disabled={!canSubmit || isSubmitting}>
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
