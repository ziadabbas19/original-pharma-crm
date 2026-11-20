import { ShieldAlertIcon, ShieldXIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LocationTrustStatus } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useReasonLabel } from './reason-label'

export function ReasonBadges({
  reasons,
  max,
  className,
}: {
  reasons: readonly string[]
  /** Show at most this many, then "+n". */
  max?: number
  className?: string
}) {
  const label = useReasonLabel()
  if (reasons.length === 0) return <span className="text-muted-foreground">—</span>
  const shown = max ? reasons.slice(0, max) : reasons
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((reason) => (
        <Badge key={reason} variant="secondary" className="font-normal">
          {label(reason)}
        </Badge>
      ))}
      {reasons.length > shown.length && (
        <Badge variant="outline" className="font-normal tabular-nums">
          +{reasons.length - shown.length}
        </Badge>
      )}
    </div>
  )
}

/** Nothing for trusted points; a warning for suspicious ones; red for physically impossible ones. */
export function TrustBadge({
  status,
  reason,
  className,
}: {
  status: LocationTrustStatus | null | undefined
  reason?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const label = useReasonLabel()
  if (!status || status === 'trusted') return null
  const rejected = status === 'rejected'
  return (
    <Badge
      variant={rejected ? 'destructive' : 'warning'}
      className={className}
      title={reason ? label(reason) : undefined}
      data-testid="trust-badge"
    >
      {rejected ? <ShieldXIcon /> : <ShieldAlertIcon />}
      {t(`suspicious.trust.${status}`)}
      {reason && <span className="font-normal">· {label(reason)}</span>}
    </Badge>
  )
}
