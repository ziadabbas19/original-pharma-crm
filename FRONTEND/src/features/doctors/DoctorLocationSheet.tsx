import { MapPinIcon, MapPinPlusIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDoctorsLocationHistory } from '@/api/generated/endpoints'
import type { DoctorLocationHistoryDto } from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LocationMap, type MapPoint } from '@/features/maps/LazyLocationMap'
import { formatDateTime, formatDistance, localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { distanceCells, locationBadges, mapLink, numberByDate } from '../visits/visit-location'
import { LocationBadges } from '../visits/VisitLocationBadges'

/** A doctor's clinic location and every visit point (numbered by date), with the stored distances. */
export function DoctorLocationSheet({ doctorId, onClose }: { doctorId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const history = useDoctorsLocationHistory(doctorId)
  const data = history.data

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="doctor-location-sheet">
        <SheetHeader>
          <SheetTitle>
            {data ? localizedName(data.name, data.nameAr) : t('doctors.locationHistory.title')}
          </SheetTitle>
          <SheetDescription>{t('doctors.locationHistory.hint')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          {history.isLoading ? (
            <LoadingState rows={6} />
          ) : history.error || !data ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : (
            <DoctorLocationContent data={data} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DoctorLocationContent({ data }: { data: DoctorLocationHistoryDto }) {
  const { t } = useTranslation()
  const numbers = useMemo(() => numberByDate(data.visits), [data.visits])
  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = data.visits.map((v) => ({
      id: v.visitId,
      lat: v.location.lat,
      lng: v.location.lng,
      kind: 'visit',
      label: String(numbers.get(v.visitId)),
      title: `${numbers.get(v.visitId)} · ${formatDateTime(v.checkInAt)} · ${v.repName}`,
      flagged: v.location.locationDrift || v.needsReview,
    }))
    if (data.medianLat != null && data.medianLng != null) {
      list.push({
        id: 'median',
        lat: data.medianLat,
        lng: data.medianLng,
        kind: 'median',
        title: t('doctors.locationHistory.median'),
      })
    }
    if (data.lat != null && data.lng != null) {
      list.push({
        id: 'clinic',
        lat: data.lat,
        lng: data.lng,
        kind: 'clinic',
        title: t('doctors.locationHistory.clinic'),
      })
    }
    return list
  }, [data, numbers, t])

  return (
    <>
      <ClinicSummary data={data} />
      {points.length > 0 ? (
        <>
          <LocationMap
            points={points}
            radiusMeters={data.lat != null ? data.geofenceRadiusMeters : undefined}
            className="relative h-72 overflow-hidden rounded-xl border"
          />
          <MapLegend hasMedian={data.medianLat != null} />
        </>
      ) : null}

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t('doctors.locationHistory.visits')}</h3>
        {data.visits.length === 0 ? (
          <EmptyState icon={MapPinIcon} title={t('doctors.locationHistory.noVisits')} className="py-6" />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[40rem] text-sm" data-testid="doctor-visit-locations">
              <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">#</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('visits.checkIn')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('visits.rep')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('visits.location.accuracy')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('visits.location.fromClinic')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('visits.location.fromPrevious')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('visits.location.fromMedian')}</th>
                  <th className="px-3 py-2 text-start font-semibold">
                    <span className="sr-only">{t('visits.review')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.visits.map((v) => (
                  <tr key={v.visitId}>
                    <td className="px-3 py-2 font-semibold tabular-nums">{numbers.get(v.visitId)}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      <a
                        href={mapLink(v.location.lat, v.location.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                        title={t('visits.location.openMap')}
                      >
                        {formatDateTime(v.checkInAt)}
                      </a>
                    </td>
                    <td className="px-3 py-2">{v.repName}</td>
                    <td className="px-3 py-2 tabular-nums">
                      ±{formatDistance(Math.round(v.location.accuracy))}
                    </td>
                    {distanceCells(v.location).map((cell) => (
                      <td
                        key={cell.key}
                        className={cn(
                          'px-3 py-2 tabular-nums',
                          cell.exceeded && 'font-semibold text-warning',
                        )}
                      >
                        {cell.meters == null ? '—' : formatDistance(cell.meters)}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <LocationBadges badges={locationBadges(v.location, v.needsReview)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.capped && (
          <p className="text-xs text-muted-foreground">{t('doctors.locationHistory.capped')}</p>
        )}
      </section>
    </>
  )
}

function ClinicSummary({ data }: { data: DoctorLocationHistoryDto }) {
  const { t } = useTranslation()
  if (data.lat == null || data.lng == null) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-dashed p-3 text-sm"
        data-testid="clinic-location-pending"
      >
        <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>{t('doctors.locationHistory.pending')}</p>
      </div>
    )
  }

  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border p-3 text-sm"
      data-testid="clinic-location-summary"
    >
      <dt className="text-muted-foreground">{t('doctors.locationHistory.clinic')}</dt>
      <dd className="tabular-nums" dir="ltr">
        <a
          href={mapLink(data.lat, data.lng)}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
        </a>
      </dd>
      <dt className="text-muted-foreground">{t('doctors.locationHistory.source')}</dt>
      <dd>
        {data.locationSource ? (
          <Badge variant={data.locationSource === 'firstVisit' ? 'secondary' : 'outline'}>
            {t(`doctors.locationSources.${data.locationSource}`)}
          </Badge>
        ) : (
          '—'
        )}
      </dd>
      {data.locationCapturedByName && (
        <>
          <dt className="text-muted-foreground">{t('doctors.locationHistory.capturedBy')}</dt>
          <dd>{data.locationCapturedByName}</dd>
        </>
      )}
      {data.locationCapturedAt && (
        <>
          <dt className="text-muted-foreground">{t('doctors.locationHistory.capturedAt')}</dt>
          <dd className="tabular-nums">{formatDateTime(data.locationCapturedAt)}</dd>
        </>
      )}
      {data.locationAccuracyMeters != null && (
        <>
          <dt className="text-muted-foreground">{t('visits.location.accuracy')}</dt>
          <dd className="tabular-nums">±{formatDistance(Math.round(data.locationAccuracyMeters))}</dd>
        </>
      )}
      <dt className="text-muted-foreground">{t('doctors.radius')}</dt>
      <dd className="tabular-nums">{formatDistance(data.geofenceRadiusMeters)}</dd>
    </dl>
  )
}

function MapLegend({ hasMedian }: { hasMedian: boolean }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="location-map-marker !size-3.5 !min-w-0 !p-0" data-kind="clinic" aria-hidden />
        {t('doctors.locationHistory.clinic')}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="location-map-marker !size-3.5 !min-w-0 !p-0" data-kind="visit" aria-hidden />
        {t('doctors.locationHistory.visitPoint')}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="location-map-marker !size-3.5 !min-w-0 !p-0"
          data-kind="visit"
          data-flagged="true"
          aria-hidden
        />
        {t('doctors.locationHistory.flaggedPoint')}
      </li>
      {hasMedian && (
        <li className="flex items-center gap-1.5">
          <span className="location-map-marker" data-kind="median" aria-hidden />
          {t('doctors.locationHistory.median')}
        </li>
      )}
      <li>{t('doctors.locationHistory.numbersHint')}</li>
    </ul>
  )
}
