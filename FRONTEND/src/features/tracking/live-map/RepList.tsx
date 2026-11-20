import { AlertTriangleIcon, BatteryLowIcon, FlagIcon, MapPinOffIcon, UsersIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '@/components/UserAvatar'
import { SearchInput } from '@/components/data-table/toolbar'
import { EmptyState } from '@/components/states'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LiveRep } from '@/store/slices/liveLocationsSlice'
import { LIVE_STATUS_DOT, LIVE_STATUSES, type LiveStatus } from '../live-status'
import { LiveStatusDot } from '../LiveStatusBadge'

export type LiveRepView = LiveRep & { liveStatus: LiveStatus }

/** Problems first, so a supervisor sees who needs a call. */
const ORDER: Record<LiveStatus, number> = { lost: 0, stale: 1, online: 2, offShift: 3 }

export function RepList({
  reps,
  now,
  selectedId,
  onSelect,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
}: {
  reps: LiveRepView[]
  now: number
  selectedId: string | null
  onSelect: (userId: string) => void
  search: string
  onSearch: (value: string) => void
  statusFilter: LiveStatus | null
  onStatusFilter: (status: LiveStatus | null) => void
}) {
  const { t } = useTranslation()

  const counts = useMemo(() => {
    const result: Record<LiveStatus, number> = { online: 0, stale: 0, lost: 0, offShift: 0 }
    for (const rep of reps) result[rep.liveStatus] += 1
    return result
  }, [reps])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reps
      .filter(
        (r) =>
          (!statusFilter || r.liveStatus === statusFilter) && (!q || r.fullName.toLowerCase().includes(q)),
      )
      .toSorted((a, b) => ORDER[a.liveStatus] - ORDER[b.liveStatus] || a.fullName.localeCompare(b.fullName))
  }, [reps, search, statusFilter])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-3">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder={t('liveMap.searchPlaceholder')}
          className="sm:w-full"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('liveMap.filterByStatus')}>
          {LIVE_STATUSES.map((status) => {
            const active = statusFilter === status
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusFilter(active ? null : status)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent',
                  active && 'border-primary bg-primary/10 text-foreground',
                )}
              >
                <span className={cn('size-2 rounded-full', LIVE_STATUS_DOT[status])} aria-hidden />
                {t(`liveMap.status.${status}`)}
                <span className="font-medium tabular-nums">{counts[status]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {reps.length === 0 ? (
          <EmptyState icon={UsersIcon} title={t('liveMap.noReps')} description={t('liveMap.noRepsHint')} />
        ) : visible.length === 0 ? (
          <EmptyState icon={UsersIcon} title={t('states.noMatches')} />
        ) : (
          <ul className="divide-y">
            {visible.map((rep) => (
              <li key={rep.userId}>
                <button
                  type="button"
                  onClick={() => onSelect(rep.userId)}
                  aria-current={rep.userId === selectedId ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-2.5 text-start transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none',
                    rep.userId === selectedId && 'bg-accent',
                  )}
                >
                  <span className="relative shrink-0">
                    <UserAvatar name={rep.fullName} src={rep.avatarUrl} />
                    <LiveStatusDot
                      status={rep.liveStatus}
                      className="absolute -end-0.5 -bottom-0.5 ring-2 ring-card"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{rep.fullName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(rep.lastSeenAt, now) ?? t('liveMap.never')}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t(`liveMap.status.${rep.liveStatus}`)}</span>
                      {!rep.position && (
                        <span className="inline-flex items-center gap-1">
                          <MapPinOffIcon className="size-3" />
                          {t('liveMap.noPosition')}
                        </span>
                      )}
                      {!rep.deviceHealthy && (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangleIcon className="size-3 text-warning" />
                          {t('liveMap.unhealthy')}
                        </span>
                      )}
                      {rep.openFlags > 0 && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <FlagIcon className="size-3" />
                          {t('liveMap.flags', { count: rep.openFlags })}
                        </span>
                      )}
                      {rep.position?.batteryLevel != null && rep.position.batteryLevel < 0.2 && (
                        <span className="inline-flex items-center gap-1">
                          <BatteryLowIcon className="size-3" />
                          {t('liveMap.battery', { percent: Math.round(rep.position.batteryLevel * 100) })}
                        </span>
                      )}
                      {rep.position?.isMock && <span className="text-destructive">{t('liveMap.mock')}</span>}
                      {!rep.position?.isMock &&
                        rep.position?.trustStatus &&
                        rep.position.trustStatus !== 'trusted' && (
                          <span
                            className={
                              rep.position.trustStatus === 'rejected' ? 'text-destructive' : 'text-warning'
                            }
                            data-testid="rep-trust"
                          >
                            {t(`suspicious.trust.${rep.position.trustStatus}`)}
                          </span>
                        )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
