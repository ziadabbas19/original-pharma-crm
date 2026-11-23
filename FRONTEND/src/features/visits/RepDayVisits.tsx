import { getRouteApi } from '@tanstack/react-router'
import { ClipboardListIcon, ClockIcon, MapPinIcon, UserRoundIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUsersList, useVisitsList } from '@/api/generated/endpoints'
import { DayPicker } from '@/components/DayPicker'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { DayExpensesCard } from '@/features/expenses/DayExpensesCard'
import { egyptToday, type DayKey } from '@/lib/egypt-day'
import { formatNumber, formatTime, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { STATUS_BADGE } from './visit-labels'
import { VisitDetailSheet } from './VisitDetailSheet'
import { AmBadge } from './AmBadge'

const route = getRouteApi('/admin/visits')
const PAGE = 50

/**
 * One day at a time for a manager: the day picker and a rep from their scope, that rep's visits of
 * the day (all reps when none is chosen) and the rep's expenses of the day.
 */
export function RepDayVisits() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const today = egyptToday()
  const day: DayKey = search.day ?? today
  const rep = search.rep
  const set = (patch: { day?: DayKey; rep?: string }) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  const canReadUsers = usePermission(P.users.read)
  const seesExpenses = usePermission(P.expenses.read)
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(null)

  const visits = useVisitsList({ day, userId: rep, limit: limit + 1 })
  // Reps to choose from: the users in scope, or (without users:read) the reps with visits that day.
  const users = useUsersList(undefined, { query: { enabled: canReadUsers } })
  const allOfDay = useVisitsList({ day }, { query: { enabled: !canReadUsers } })
  const reps = useMemo(() => {
    if (canReadUsers) {
      return (users.data ?? []).filter((u) => u.isActive).map((u) => [u.id, u.fullName] as const)
    }
    const byId = new Map((allOfDay.data ?? []).map((v) => [v.userId, v.userName]))
    return [...byId.entries()]
  }, [canReadUsers, users.data, allOfDay.data])

  const rows = (visits.data ?? []).slice(0, limit)
  const hasMore = (visits.data?.length ?? 0) > limit
  const completed = rows.filter((v) => v.status === 'completed').length
  const review = rows.filter((v) => v.needsReview).length

  return (
    <div className="grid gap-4" data-testid="rep-day-visits">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_16rem]">
        <DayPicker
          value={day}
          today={today}
          onChange={(next) => {
            setLimit(PAGE)
            set({ day: next === today ? undefined : next })
          }}
        />
        <NativeSelect
          aria-label={t('visits.rep')}
          value={rep ?? ''}
          onChange={(e) => set({ rep: e.target.value || undefined })}
          selectClassName="h-11"
          data-testid="day-rep"
        >
          <option value="">{t('visits.allReps')}</option>
          {reps.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="rep-day-totals">
        {t('visits.dayTotals.summary', {
          visits: formatNumber(rows.length),
          completed: formatNumber(completed),
          review: formatNumber(review),
        })}
      </p>

      {visits.isLoading ? (
        <LoadingState rows={4} />
      ) : visits.error ? (
        <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={day > today ? t('visits.emptyFutureDay') : t('visits.emptyDayOf')}
        />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="rep-day-visit-list">
          {rows.map((v) => (
            <li key={v.id}>
              <button type="button" className="w-full text-start" onClick={() => setOpenId(v.id)}>
                <Card className="gap-1.5 py-3 transition-colors hover:bg-accent/50">
                  <CardContent className="grid gap-1.5 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          <AmBadge type={v.customerType} className="me-1.5" />
                          {localizedName(v.customerName, v.customerNameAr)}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <ClockIcon className="size-3.5" aria-hidden />
                            {formatTime(v.checkInAt)}
                            {v.checkOutAt && ` - ${formatTime(v.checkOutAt)}`}
                          </span>
                          {v.customerTerritoryName && (
                            <span className="inline-flex items-center gap-1">
                              <MapPinIcon className="size-3.5" aria-hidden />
                              {localizedName(v.customerTerritoryName, v.customerTerritoryNameAr)}
                            </span>
                          )}
                          {!rep && (
                            <span className="inline-flex items-center gap-1">
                              <UserRoundIcon className="size-3.5" aria-hidden />
                              {v.userName}
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE[v.status]}>{t(`visits.statuses.${v.status}`)}</Badge>
                    </div>
                    {v.needsReview && (
                      <Badge variant="destructive" className="w-fit">
                        {t('visits.needsReview')}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
          {t('visits.showMore')}
        </Button>
      )}

      {seesExpenses && rep && <DayExpensesCard day={day} userId={rep} mode="manage" />}
      {seesExpenses && !rep && <p className="text-sm text-muted-foreground">{t('expenses.pickRepForDay')}</p>}

      {openId && <VisitDetailSheet key={openId} visitId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
