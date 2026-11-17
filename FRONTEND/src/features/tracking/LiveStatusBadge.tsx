import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { LIVE_STATUS_BADGE, LIVE_STATUS_DOT, type LiveStatus } from './live-status'

export function LiveStatusBadge({ status, className }: { status: LiveStatus; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant={LIVE_STATUS_BADGE[status]} className={className}>
      <span className={cn('size-1.5 rounded-full', LIVE_STATUS_DOT[status])} aria-hidden />
      {t(`liveMap.status.${status}`)}
    </Badge>
  )
}

export function LiveStatusDot({ status, className }: { status: LiveStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full ring-2 ring-card',
        LIVE_STATUS_DOT[status],
        className,
      )}
      aria-hidden
    />
  )
}
