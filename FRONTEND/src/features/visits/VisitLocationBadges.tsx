import { MapPinPlusIcon, MapPinXIcon, ShieldAlertIcon, WaypointsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { LocationBadge } from './visit-location'

const ICONS = {
  drift: WaypointsIcon,
  flagged: ShieldAlertIcon,
  firstVisit: MapPinPlusIcon,
  notSaved: MapPinXIcon,
} as const

const VARIANTS = {
  drift: 'warning',
  flagged: 'destructive',
  firstVisit: 'secondary',
  notSaved: 'warning',
} as const

/** Drift / flagged / clinic-location badges of a visit (see locationBadges). */
export function LocationBadges({ badges }: { badges: LocationBadge[] }) {
  const { t } = useTranslation()
  if (badges.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((badge) => {
        const Icon = ICONS[badge]
        return (
          <Badge key={badge} variant={VARIANTS[badge]} data-testid={`location-badge-${badge}`}>
            <Icon aria-hidden />
            {t(`visits.location.badges.${badge}`)}
          </Badge>
        )
      })}
    </span>
  )
}
