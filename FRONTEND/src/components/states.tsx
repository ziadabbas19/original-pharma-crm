import { AlertTriangleIcon, InboxIcon, Loader2Icon, RotateCcwIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/errors'
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
  return (
    <Alert variant="destructive" className={cn('my-2', className)}>
      <AlertTriangleIcon />
      <AlertTitle>{t('states.errorTitle')}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error, t)}</p>
        {onRetry && (
          <Button size="sm" variant="outline" className="mt-1 text-foreground" onClick={onRetry}>
            <RotateCcwIcon />
            {t('common.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** Inline error under a form or inside a dialog (no retry). */
export function FormError({ error }: { error: unknown }) {
  const { t } = useTranslation()
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertDescription>{errorMessage(error, t)}</AlertDescription>
    </Alert>
  )
}
