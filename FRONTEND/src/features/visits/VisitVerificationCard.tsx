import { MapPinCheckIcon, MapPinXIcon, ShieldAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { VisitDetailDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatDistance } from '@/lib/format'
import { VisitPhotos } from './VisitPhotos'

const LATE_SYNC_MS = 5 * 60_000

/** Reasons that question the location itself (as opposed to a missing check-out fix). */
const TRUST_REASONS = new Set(['mock-location', 'far-from-doctor', 'low-trust'])

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 tabular-nums">{children}</dd>
    </>
  )
}

/** How the visit was verified: distance, accuracy, flags and proof. The same for the rep and the dashboard. */
export function VisitVerificationCard({ visit }: { visit: VisitDetailDto }) {
  const { t } = useTranslation()
  const receivedLate =
    new Date(visit.checkInReceivedAt).getTime() - new Date(visit.checkInAt).getTime() > LATE_SYNC_MS
  const closed = visit.checkOutAt != null
  const locationFlagged = visit.reviewReasons.some((r) => TRUST_REASONS.has(r))

  return (
    <section className="grid gap-3 rounded-lg border p-3" data-testid="visit-verification">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t('visits.verification.title')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {locationFlagged && (
            <Badge variant="destructive" data-testid="visit-location-flagged">
              <ShieldAlertIcon aria-hidden />
              {t('visits.verification.locationFlagged')}
            </Badge>
          )}
          {visit.checkInWithinGeofence ? (
            <Badge variant="success">
              <MapPinCheckIcon aria-hidden />
              {t('visits.inside')}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <MapPinXIcon aria-hidden />
              {t('visits.outside')}
            </Badge>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Fact label={t('visits.distance')}>
          {t('visits.verification.distanceOf', {
            distance: formatDistance(visit.checkInDistanceMeters),
            radius: formatDistance(visit.geofenceRadiusMeters),
          })}
        </Fact>
        <Fact label={t('visits.verification.accuracy')}>
          {formatDistance(Math.round(visit.checkInAccuracy))}
        </Fact>
        {closed && (
          <Fact label={t('visits.verification.checkOutLocation')}>
            {visit.checkOutDistanceMeters != null
              ? t('visits.verification.checkOutFix', {
                  distance: formatDistance(visit.checkOutDistanceMeters),
                  accuracy: formatDistance(Math.round(visit.checkOutAccuracy ?? 0)),
                })
              : t('visits.verification.noCheckOutFix')}
          </Fact>
        )}
        {receivedLate && (
          <Fact label={t('visits.verification.receivedAt')}>{formatDateTime(visit.checkInReceivedAt)}</Fact>
        )}
      </dl>

      {visit.reviewReasons.length > 0 && (
        <ul className="grid gap-1 text-sm" data-testid="visit-review-reasons">
          {visit.reviewReasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2">
              <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {t(`visits.reviewReasons.${reason}`)}
            </li>
          ))}
        </ul>
      )}

      {visit.photos.length > 0 && <VisitPhotos photos={visit.photos} />}
    </section>
  )
}
