import { Link } from '@tanstack/react-router'
import { CheckIcon, ClipboardListIcon, ListIcon, MapIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocationIntegrityGetEvent } from '@/api/generated/endpoints'
import type { DeviceSignalsDto, IntegrityEventDto } from '@/api/generated/model'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { usePermission } from '@/features/auth/usePermission'
import { FlagStatusBadge, FlagTypeBadge, ScoreBadge } from '@/features/flags/flag-display'
import { formatDateTime, formatDay, formatDistance, formatTime, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { AcknowledgeEventDialog } from './AcknowledgeEventDialog'
import { canAcknowledge, eventTarget, type RepDayGroup } from './suspicious-logic'
import { ReasonBadges, TrustBadge } from './trust-display'

/** Every event of one rep on one day, with the evidence behind each and the acknowledge action. */
export function RepDaySheet({ group, onClose }: { group: RepDayGroup; onClose: () => void }) {
  const { t } = useTranslation()
  const [acknowledging, setAcknowledging] = useState<IntegrityEventDto | null>(null)

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="overflow-y-auto sm:max-w-xl" data-testid="rep-day-sheet">
          <SheetHeader>
            <SheetTitle>{group.userName}</SheetTitle>
            <SheetDescription>
              {formatDay(group.day)} · {t('suspicious.eventCount', { count: group.events.length })}
            </SheetDescription>
          </SheetHeader>
          <ol className="grid gap-3 px-4 pb-6">
            {group.events.map((event) => (
              <EventCard key={event.id} event={event} onAcknowledge={() => setAcknowledging(event)} />
            ))}
          </ol>
        </SheetContent>
      </Sheet>
      {acknowledging && (
        <AcknowledgeEventDialog
          key={acknowledging.id}
          event={acknowledging}
          onClose={() => setAcknowledging(null)}
        />
      )}
    </>
  )
}

function EventCard({ event, onAcknowledge }: { event: IntegrityEventDto; onAcknowledge: () => void }) {
  const { t } = useTranslation()
  const canViewLive = usePermission(P.tracking.viewLive)
  const canReadVisits = usePermission(P.visits.read)
  const [showEvidence, setShowEvidence] = useState(false)
  const target = eventTarget(event)

  return (
    <li className="grid gap-2 rounded-lg border p-3" data-testid="suspicious-event">
      <div className="flex flex-wrap items-center gap-1.5">
        <FlagTypeBadge type={event.type} />
        <FlagStatusBadge status={event.status} />
        <ScoreBadge score={event.score} />
        {event.occurrences > 1 && (
          <Badge variant="outline" className="tabular-nums">
            {t('suspicious.occurrences', { count: event.occurrences })}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {formatTime(event.createdAt)}
        {event.lastSeenAt && ` – ${formatTime(event.lastSeenAt)}`}
        {event.customerName && ` · ${localizedName(event.customerName, event.customerNameAr)}`}
      </div>
      <ReasonBadges reasons={event.signals} />
      {event.details && <p className="text-sm whitespace-pre-line text-muted-foreground">{event.details}</p>}

      {event.reviewNote && (
        <div className="rounded-md bg-muted p-2 text-sm" data-testid="review-note">
          <p className="whitespace-pre-line">{event.reviewNote}</p>
          {event.reviewedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('suspicious.reviewedBy', {
                name: event.reviewedByName ?? '—',
                time: formatDateTime(event.reviewedAt),
              })}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canAcknowledge(event) && (
          <Button
            size="sm"
            variant={event.status === 'open' ? 'default' : 'outline'}
            onClick={onAcknowledge}
            data-testid="acknowledge-event"
          >
            <CheckIcon />
            {event.status === 'open' ? t('suspicious.acknowledge.action') : t('suspicious.acknowledge.edit')}
          </Button>
        )}
        {target.kind === 'visit' && canReadVisits && (
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/visits" search={{ visit: target.visitId }}>
              <ClipboardListIcon />
              {t('suspicious.openVisit')}
            </Link>
          </Button>
        )}
        {target.kind === 'hidden' && (
          <p className="text-xs text-muted-foreground" data-testid="event-location-hidden">
            {t('suspicious.locationHidden')}
          </p>
        )}
        {target.kind === 'map' && canViewLive && (
          <Button asChild size="sm" variant="outline">
            <Link
              to="/admin/live-map"
              search={{ rep: target.userId, day: target.day, at: target.at ?? undefined }}
            >
              <MapIcon />
              {t('suspicious.showOnMap')}
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowEvidence((v) => !v)}
          aria-expanded={showEvidence}
        >
          <ListIcon />
          {showEvidence ? t('suspicious.hideEvidence') : t('suspicious.showEvidence')}
        </Button>
      </div>

      {showEvidence && <EventEvidence eventId={event.id} />}
    </li>
  )
}

function EventEvidence({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const detail = useLocationIntegrityGetEvent(eventId)

  if (detail.isLoading) return <LoadingState rows={3} />
  if (detail.error || !detail.data) {
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
  }

  const { points, visit } = detail.data
  const signals = points.find((p) => p.deviceSignals)?.deviceSignals ?? null

  return (
    <div className="grid gap-3 border-t pt-3" data-testid="event-evidence">
      {visit && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('visits.checkIn')}</dt>
          <dd className="tabular-nums">
            {formatTime(visit.checkInAt)} · {formatDistance(visit.checkInDistanceMeters)} ·{' '}
            {t('suspicious.points.accuracyOf', { value: formatDistance(Math.round(visit.checkInAccuracy)) })}
          </dd>
          {visit.checkOutAt && (
            <>
              <dt className="text-muted-foreground">{t('visits.checkOut')}</dt>
              <dd className="tabular-nums">
                {formatTime(visit.checkOutAt)}
                {visit.checkOutDistanceMeters != null && ` · ${formatDistance(visit.checkOutDistanceMeters)}`}
              </dd>
            </>
          )}
          <dt className="self-start text-muted-foreground">{t('suspicious.reasons')}</dt>
          <dd>
            <ReasonBadges reasons={visit.reviewReasons} />
          </dd>
        </dl>
      )}

      {points.length === 0 ? (
        !visit && <p className="text-sm text-muted-foreground">{t('suspicious.points.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-start">
                <th className="py-1 pe-3 text-start font-medium">{t('suspicious.points.time')}</th>
                <th className="py-1 pe-3 text-start font-medium">{t('suspicious.points.position')}</th>
                <th className="py-1 pe-3 text-start font-medium">{t('suspicious.points.accuracy')}</th>
                <th className="py-1 pe-3 text-start font-medium">{t('suspicious.points.status')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.id} className="border-t align-top">
                  <td className="py-1.5 pe-3 tabular-nums">
                    {formatTime(point.recordedAt)}
                    {point.deviceTime && (
                      <span className="block text-xs text-muted-foreground">
                        {t('suspicious.points.deviceTime', { time: formatTime(point.deviceTime) })}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                    {point.lat != null && point.lng != null ? (
                      `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
                    ) : (
                      <span className="font-sans text-muted-foreground" dir="auto">
                        {t('suspicious.points.hidden')}
                      </span>
                    )}
                    {point.altitude != null && (
                      <span className="block text-muted-foreground">
                        {t('suspicious.points.altitude', { value: Math.round(point.altitude) })}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pe-3 tabular-nums">{formatDistance(point.accuracy)}</td>
                  <td className="py-1.5">
                    <TrustBadge status={point.trustStatus} />
                    {point.isMock && (
                      <Badge variant="destructive" className="ms-1">
                        {t('liveMap.mock')}
                      </Badge>
                    )}
                    {point.codes.length > 0 && (
                      <ReasonBadges reasons={point.codes} max={3} className="mt-1" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {signals && <DeviceSignalsList signals={signals} />}
    </div>
  )
}

function DeviceSignalsList({ signals }: { signals: DeviceSignalsDto }) {
  const { t } = useTranslation()
  const yesNo = (value: boolean | null | undefined) =>
    value == null
      ? t('suspicious.device.unknown')
      : value
        ? t('suspicious.device.yes')
        : t('suspicious.device.no')
  const rows: [string, string][] = [
    [t('suspicious.device.developerOptions'), yesNo(signals.developerOptionsEnabled)],
    [t('suspicious.device.mockApp'), yesNo(signals.mockLocationAppSelected)],
    [
      t('suspicious.device.spoofingApps'),
      signals.spoofingApps?.length ? signals.spoofingApps.join(', ') : t('suspicious.device.none'),
    ],
    [t('suspicious.device.autoTime'), yesNo(signals.autoTimeEnabled)],
    [t('suspicious.device.emulator'), yesNo(signals.emulator)],
    [t('suspicious.device.rooted'), yesNo(signals.rooted)],
  ]
  return (
    <section className="grid gap-1" data-testid="device-signals">
      <h4 className="text-xs font-semibold text-muted-foreground">{t('suspicious.device.title')}</h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
