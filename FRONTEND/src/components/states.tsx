import {
  AlertTriangleIcon,
  InboxIcon,
  Loader2Icon,
  RotateCcwIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage, getErrorReference, normalizeError, type AppError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * The three non-data states every list and panel uses, so loading, empty and
 * failed requests look and read the same across the dashboard.
 */

export function LoadingState({
  rows = 5,
  className,
  label,
}: {
  rows?: number
  className?: string
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation()
  return (
    <div
      className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden />
      <span>{label ?? t('common.loading')}</span>
    </div>
  )
}

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/**
 * A request that failed where data should be. Takes any error (normalized here); shows the localized
 * message, a retry button when trying again can help, and the reference id for server failures.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const appError = useMemo(() => normalizeError(error), [error])
  if (appError.kind === 'cancelled') return null
  const reference = getErrorReference(appError)
  const offline = appError.kind === 'network'
  return (
    <Alert
      variant={offline ? 'warning' : 'destructive'}
      className={cn('my-2', className)}
      data-testid="error-state"
      data-kind={appError.kind}
    >
      {offline ? <WifiOffIcon /> : <AlertTriangleIcon />}
      <AlertTitle>{t('states.errorTitle')}</AlertTitle>
      <AlertDescription>
        <p>{getErrorMessage(appError, t)}</p>
        {reference && (
          <p className="text-xs opacity-80 select-all" data-testid="error-reference">
            {t('errors.reference', { id: reference })}
          </p>
        )}
        {onRetry && appError.retryable && (
          <Button size="sm" variant="outline" className="mt-1 min-h-11 text-foreground" onClick={onRetry}>
            <RotateCcwIcon />
            {t('common.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** Inline error under a form or inside a dialog (no retry). Accepts a raw error or an AppError. */
export function FormError({ error }: { error: AppError | unknown }) {
  const { t } = useTranslation()
  if (!error) return null
  const appError = normalizeError(error)
  if (appError.kind === 'cancelled') return null
  const reference = getErrorReference(appError)
  return (
    <Alert variant="destructive" data-testid="form-error" data-kind={appError.kind}>
      <AlertTriangleIcon />
      <AlertDescription>
        <p>{getErrorMessage(appError, t)}</p>
        {reference && (
          <p className="text-xs opacity-80 select-all">{t('errors.reference', { id: reference })}</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
