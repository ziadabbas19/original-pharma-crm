import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { HomeIcon, RotateCcwIcon, SearchXIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { getErrorMessage, getErrorReference, handleError } from '@/lib/errors'

/** Unknown address. */
export function NotFound() {
  const { t } = useTranslation()
  return (
    <ErrorScreen
      icon={SearchXIcon}
      title={t('errors.page.notFoundTitle')}
      message={t('errors.page.notFoundText')}
    />
  )
}

/** A route failed to load or render. The message comes from the central error handler. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const appError = useMemo(() => handleError(error, { silent: true, context: 'route' }), [error])
  const reference = getErrorReference(appError)

  // A page that crashed for a kind that can recover (network, server) retries with fresh data.
  const retry = appError.retryable
    ? () => {
        reset()
        void router.invalidate()
      }
    : undefined

  useEffect(() => {
    document.title = t('common.appName')
  }, [t])

  return (
    <ErrorScreen
      icon={TriangleAlertIcon}
      title={t('errors.page.title')}
      message={getErrorMessage(appError, t)}
      reference={reference ? t('errors.reference', { id: reference }) : undefined}
      onRetry={retry}
    />
  )
}

function ErrorScreen({
  icon: Icon,
  title,
  message,
  reference,
  onRetry,
}: {
  icon: LucideIcon
  title: string
  message: string
  reference?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 bg-background p-6 pt-safe text-center"
      role="alert"
      data-testid="error-screen"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-7" aria-hidden />
      </div>
      <div className="grid max-w-sm gap-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {reference && (
          <p className="text-xs text-muted-foreground select-all" data-testid="error-reference">
            {reference}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button size="lg" onClick={onRetry}>
            <RotateCcwIcon />
            {t('common.retry')}
          </Button>
        )}
        <Button asChild size="lg" variant="outline">
          <Link to="/">
            <HomeIcon />
            {t('errors.page.home')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
