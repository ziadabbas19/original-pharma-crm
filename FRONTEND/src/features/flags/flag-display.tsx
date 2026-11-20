import {
  ActivityIcon,
  AlertTriangleIcon,
  MapPinOffIcon,
  ShieldAlertIcon,
  ShieldQuestionIcon,
  ShieldXIcon,
  LocateOffIcon,
  SmartphoneIcon,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TrackingFlagStatus, TrackingFlagType } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'

const TYPE_ICON: Record<TrackingFlagType, LucideIcon> = {
  anomaly: ActivityIcon,
  mockLocation: ShieldAlertIcon,
  trackingLost: LocateOffIcon,
  unhealthyDevice: SmartphoneIcon,
  integrityFailed: AlertTriangleIcon,
  visitOutsideGeofence: MapPinOffIcon,
  visitLowTrust: ShieldQuestionIcon,
  suspiciousDevice: ShieldXIcon,
}

const STATUS_BADGE: Record<TrackingFlagStatus, 'destructive' | 'secondary' | 'outline'> = {
  open: 'destructive',
  confirmed: 'secondary',
  dismissed: 'outline',
  acknowledged: 'secondary',
}

export function FlagTypeBadge({ type }: { type: TrackingFlagType }) {
  const { t } = useTranslation()
  const Icon = TYPE_ICON[type]
  return (
    <Badge variant="outline">
      <Icon />
      {t(`flags.types.${type}`)}
    </Badge>
  )
}

export function FlagStatusBadge({ status }: { status: TrackingFlagStatus }) {
  const { t } = useTranslation()
  return <Badge variant={STATUS_BADGE[status]}>{t(`flags.statuses.${status}`)}</Badge>
}

/** Anomaly score 0-100: the API raises a flag from 50 by default. */
export function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 70 ? 'destructive' : score >= 40 ? 'warning' : 'secondary'
  return (
    <Badge variant={variant} className="tabular-nums">
      {score}
    </Badge>
  )
}

export function SignalList({ signals }: { signals: string[] }) {
  const { t } = useTranslation()
  if (signals.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <Badge key={signal} variant="secondary" className="font-normal">
          {t([`flags.signals.${signal}`, `health.issues.${signal}`], { defaultValue: signal })}
        </Badge>
      ))}
    </div>
  )
}
