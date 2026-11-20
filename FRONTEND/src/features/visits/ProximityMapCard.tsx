import { useTranslation } from 'react-i18next'
import { formatDistance } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ProximityResult } from './visit-proximity'

const SIZE = 200
const CENTER = SIZE / 2
const OUTER = 84

/**
 * A drawn "map" of where the rep stands relative to the clinic: the clinic in the middle, the allowed
 * range as a ring and the rep as a dot at scale. Drawn locally, so it works without a connection or map
 * tiles; the exact distance is written underneath.
 */
export function ProximityMapCard({ result }: { result: ProximityResult }) {
  const { t } = useTranslation()
  if (result.state !== 'inside' && result.state !== 'outside' && result.state !== 'firstVisit') return null

  const measured = result.state !== 'firstVisit'
  const distance = measured ? result.distance : 0
  const allowed = measured ? result.allowed : 0
  // Scale so both the range and the rep fit, with the range never smaller than a third of the drawing.
  const scale = measured ? OUTER / Math.max(allowed * 1.5, distance * 1.15, 1) : 0
  const rangeRadius = measured ? Math.max(allowed * scale, OUTER / 3) : 0
  const repRadius = measured ? Math.min(distance * scale, OUTER) : 0
  // A fixed bearing: the drawing shows how far, not in which direction.
  const repX = CENTER + repRadius * Math.cos(-Math.PI / 4)
  const repY = CENTER + repRadius * Math.sin(-Math.PI / 4)
  const inside = result.state === 'inside' || result.state === 'firstVisit'

  return (
    <figure
      className="relative overflow-hidden rounded-card border bg-primary-soft/40 p-3"
      data-testid="proximity-map-card"
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block h-44 w-44" role="img" aria-hidden>
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={CENTER} cy={CENTER} r={OUTER * f} className="fill-none stroke-border" />
        ))}
        {measured && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={rangeRadius}
            className={cn(
              'stroke-[1.5] [stroke-dasharray:4_4]',
              inside ? 'fill-green/20 stroke-green-text' : 'fill-primary/10 stroke-primary',
            )}
          />
        )}
        {measured && repRadius > 0 && (
          <line x1={CENTER} y1={CENTER} x2={repX} y2={repY} className="stroke-muted-foreground stroke-1" />
        )}
        <circle cx={CENTER} cy={CENTER} r={9} className="fill-green stroke-card stroke-[3]" />
        <circle cx={CENTER} cy={CENTER} r={3} className="fill-green-foreground" />
        {measured && <circle cx={repX} cy={repY} r={7} className="fill-primary stroke-card stroke-[3]" />}
        {!measured && <circle cx={CENTER} cy={CENTER} r={18} className="fill-none stroke-primary stroke-2" />}
      </svg>
      <figcaption className="mt-1 grid justify-items-center gap-0.5 text-center">
        {measured ? (
          <>
            <span className="text-2xl font-bold tabular-nums">{formatDistance(distance)}</span>
            <span className="text-xs text-muted-foreground">
              {t('visits.checkInFlow.mapAllowed', { allowed: formatDistance(allowed) })}
            </span>
          </>
        ) : (
          <span className="text-sm font-medium">{t('visits.checkInFlow.mapFirstVisit')}</span>
        )}
      </figcaption>
    </figure>
  )
}
