import { MapPinCheckIcon, MapPinPlusIcon, MapPinXIcon, ShieldAlertIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { VisitDetailDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { LocationMap, type MapPoint } from '@/features/maps/LazyLocationMap'
import { formatDateTime, formatDistance, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clinicOutcomeKey, distanceCells, gapParts, mapLink } from './visit-location'
import { VisitPhotos } from './VisitPhotos'

const LATE_SYNC_MS = 5 * 60_000

/** Reasons that question the location itself (as opposed to a missing check-out fix). */
const TRUST_REASONS = new Set(['mock-location', 'far-from-doctor', 'low-trust', 'location-drift'])

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 tabular-nums">{children}</dd>
    </>
  )
}

/**
 * How the visit was verified: distance, accuracy, flags and proof. The same for the rep and the dashboard;
 * the dashboard also shows the map and how the visit compares with the earlier visits (`showHistory`).
 */
export function VisitVerificationCard({
  visit,
  showHistory = false,
}: {
  visit: VisitDetailDto
  showHistory?: boolean
}) {
  const { t } = useTranslation()
  const location = visit.location
  const outcome = clinicOutcomeKey(location?.clinicLocationOutcome)
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

      {outcome && (
        <p className="flex items-start gap-2 text-sm" data-testid="visit-clinic-outcome">
          <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t(outcome)}
        </p>
      )}

      {showHistory && <VisitMap visit={visit} />}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Fact label={t('visits.distance')}>
          {location?.clinicLocationOutcome === 'notSaved'
            ? '—'
            : t('visits.verification.distanceOf', {
                distance: formatDistance(location?.clinicDistanceMeters ?? visit.checkInDistanceMeters),
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
        {showHistory && location && (
          <>
            {distanceCells(location)
              .filter((cell) => cell.key !== 'clinic')
              .map((cell) => (
                <Fact
                  key={cell.key}
                  label={t(`visits.location.from${cell.key === 'previous' ? 'Previous' : 'Median'}`)}
                >
                  <span className={cn(cell.exceeded && 'font-semibold text-warning')}>
                    {cell.meters == null ? '—' : formatDistance(cell.meters)}
                  </span>
                  {cell.key === 'previous' && gapParts(location.sincePreviousVisitSeconds) && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {t('visits.location.gap', gapParts(location.sincePreviousVisitSeconds)!)}
                    </span>
                  )}
                </Fact>
              ))}
            <Fact label={t('visits.location.nearest')}>
              {location.nearestVisitDistanceMeters == null
                ? '—'
                : formatDistance(location.nearestVisitDistanceMeters)}
              <span className="text-muted-foreground">
                {' '}
                ·{' '}
                {t('visits.location.references', {
                  count: location.referenceVisitCount,
                  value: formatNumber(location.referenceVisitCount),
                })}
              </span>
            </Fact>
            <Fact label={t('visits.location.point')}>
              <a
                href={mapLink(location.lat, location.lng)}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </a>
            </Fact>
          </>
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

/** Clinic, check-in and check-out of one visit on a small map (dashboard only). */
function VisitMap({ visit }: { visit: VisitDetailDto }) {
  const { t } = useTranslation()
  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = []
    if (visit.location) {
      list.push({
        id: 'check-in',
        lat: visit.location.lat,
        lng: visit.location.lng,
        kind: 'visit',
        label: '1',
        title: t('visits.location.checkInPoint'),
        flagged: visit.location.locationDrift || visit.needsReview,
      })
    }
    if (visit.checkOutLat != null && visit.checkOutLng != null) {
      list.push({
        id: 'check-out',
        lat: visit.checkOutLat,
        lng: visit.checkOutLng,
        kind: 'checkOut',
        title: t('visits.location.checkOutPoint'),
      })
    }
    if (visit.clinicLat != null && visit.clinicLng != null) {
      list.push({
        id: 'clinic',
        lat: visit.clinicLat,
        lng: visit.clinicLng,
        kind: 'clinic',
        title: t('doctors.locationHistory.clinic'),
      })
    }
    return list
  }, [visit, t])
  if (points.length === 0) return null
  return (
    <LocationMap
      points={points}
      radiusMeters={visit.clinicLat != null ? visit.geofenceRadiusMeters : undefined}
      className="relative h-48 overflow-hidden rounded-xl border"
    />
  )
}
