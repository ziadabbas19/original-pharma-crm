import { getRouteApi, Link } from '@tanstack/react-router'
import {
  ClipboardListIcon,
  ClockIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PackageIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsList } from '@/api/generated/endpoints'
import type { VisitListItemDto, VisitStatus } from '@/api/generated/model'
import { DayPicker } from '@/components/DayPicker'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { DayExpensesCard } from '@/features/expenses/DayExpensesCard'
import { MonthExpensesCard } from '@/features/expenses/MonthExpenses'
import { productName } from '@/features/orders/order-labels'
import { useOrderReferenceData } from '@/features/orders/use-order-data'
import { egyptDayOf, egyptToday, monthOf, type DayKey } from '@/lib/egypt-day'
import { formatNumber, formatTime, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { CATEGORY_BADGE, STATUS_BADGE } from './visit-labels'
import { retryVisit, syncVisits, useVisitOutbox, visitSyncState } from './visit-outbox'
import type { CheckInStep } from './visit-queue'
import { VisitSyncBadge } from './VisitSyncBadge'
import { AmBadge } from './AmBadge'

const route = getRouteApi('/rep/visits/')

/** Visits per page of the day list; "show more" adds another page. */
const PAGE = 50

/** A visit that is still only on this device, in the shape of the list. */
function localRow(step: CheckInStep, closed: boolean): VisitListItemDto {
  return {
    id: step.visitId,
    userId: step.userId,
    userName: '',
    customerId: step.customer.id,
    customerName: step.customer.name,
    customerNameAr: step.customer.nameAr ?? null,
    customerType: step.customer.type,
    status: closed ? 'completed' : 'inProgress',
    checkInAt: step.request.timestamp,
    checkInDistanceMeters: step.distance,
    checkInWithinGeofence: step.inside,
    checkOutAt: null,
    checkOutDistanceMeters: null,
    checkOutWithinGeofence: null,
    qrVerified: false,
    needsReview: !step.inside || step.request.isMock === true,
    photoCount: 0,
    checkInAccuracy: step.request.accuracy,
    checkInIsMock: step.request.isMock === true,
    productIds: [],
    reviewReasons: [],
  }
}

/** Minutes spent at completed visits. */
function visitMinutes(rows: readonly VisitListItemDto[]): number {
  return rows.reduce((sum, v) => {
    if (!v.checkOutAt) return sum
    const minutes = (new Date(v.checkOutAt).getTime() - new Date(v.checkInAt).getTime()) / 60_000
    return sum + Math.max(0, Math.round(minutes))
  }, 0)
}

/**
 * "My visits", one Egypt day at a time (today unless another day is chosen): the day's visits with
 * what is still waiting on this device, the day's totals, then the day's expenses and the month's.
 */
export function RepVisitsPage() {
  const { t, i18n } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const today = egyptToday()
  const day: DayKey = search.day ?? today
  const setDay = (next: DayKey) =>
    void navigate({ search: { day: next === today ? undefined : next }, replace: true })

  const outbox = useVisitOutbox()
  const { products } = useOrderReferenceData()
  const seesExpenses = usePermission(P.expenses.readOwn)
  const [limit, setLimit] = useState(PAGE)
  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [withFeedback, setWithFeedback] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)

  // Another day starts from its first page and without the previous day's filters.
  const [shownDay, setShownDay] = useState(day)
  if (shownDay !== day) {
    setShownDay(day)
    setLimit(PAGE)
    setCustomerId('')
    setProductId('')
    setWithFeedback(false)
  }

  const cacheKey = `my-visits-${day}`
  const copy = readCache<VisitListItemDto[]>(cacheKey)
  const visits = useVisitsList(
    { mine: true, day, limit: limit + 1 },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 30_000 } },
  )

  useEffect(() => {
    if (visits.data && visits.isFetchedAfterMount) writeCache(cacheKey, visits.data)
  }, [cacheKey, visits.data, visits.isFetchedAfterMount])

  const hasMore = (visits.data?.length ?? 0) > limit

  const rows = useMemo(() => {
    const server = (visits.data ?? []).slice(0, limit)
    const known = new Set(server.map((v) => v.id))
    const queued = [...outbox.steps, ...outbox.failedSteps].map((i) => i.payload)
    const closing = new Set(queued.filter((s) => s.type === 'checkOut').map((s) => s.visitId))
    const local = queued
      .filter((s): s is CheckInStep => s.type === 'checkIn' && !known.has(s.visitId))
      .filter((s) => egyptDayOf(s.request.timestamp) === day)
      .map((s) => localRow(s, closing.has(s.visitId)))
    const fromServer = server.map((v): VisitListItemDto =>
      closing.has(v.id) ? { ...v, status: 'completed' as VisitStatus } : v,
    )
    return [...local, ...fromServer].sort((a, b) => b.checkInAt.localeCompare(a.checkInAt))
  }, [visits.data, limit, outbox.steps, outbox.failedSteps, day])

  const customers = useMemo(() => {
    const byId = new Map(rows.map((v) => [v.customerId, localizedName(v.customerName, v.customerNameAr)]))
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(
    () =>
      rows.filter(
        (v) =>
          (!customerId || v.customerId === customerId) &&
          (!productId || v.productIds.includes(productId)) &&
          (!withFeedback || v.hasFeedback),
      ),
    [rows, customerId, productId, withFeedback],
  )

  const filtered = customerId !== '' || productId !== '' || withFeedback
  const totals = {
    visits: rows.length,
    completed: rows.filter((v) => v.status === 'completed').length,
    review: rows.filter((v) => v.needsReview).length,
    minutes: visitMinutes(rows),
  }

  const retry = async (visitId: string, refused: boolean) => {
    setRetrying(visitId)
    try {
      await (refused ? retryVisit(visitId) : syncVisits())
    } finally {
      setRetrying(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('visits.mine')}</h1>

      <DayPicker value={day} today={today} onChange={setDay} />

      <dl className="grid grid-cols-4 gap-2 text-center" data-testid="day-totals">
        <DayTotal label={t('visits.dayTotals.visits')} value={formatNumber(totals.visits)} />
        <DayTotal label={t('visits.dayTotals.completed')} value={formatNumber(totals.completed)} />
        <DayTotal
          label={t('visits.dayTotals.review')}
          value={formatNumber(totals.review)}
          attention={totals.review > 0}
        />
        <DayTotal
          label={t('visits.dayTotals.time')}
          value={t('visits.dayTotals.minutes', { value: formatNumber(totals.minutes) })}
        />
      </dl>

      {rows.length > 0 && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect
              aria-label={t('visits.customer')}
              selectClassName="h-11"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              data-testid="filter-customer"
            >
              <option value="">{t('visits.filters.allCustomers')}</option>
              {customers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={t('visits.products.filter')}
              selectClassName="h-11"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              data-testid="filter-product"
            >
              <option value="">{t('visits.filters.allProducts')}</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {productName(p, i18n.resolvedLanguage)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <button
            type="button"
            aria-pressed={withFeedback}
            onClick={() => setWithFeedback((v) => !v)}
            data-testid="filter-feedback"
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm transition-colors',
              withFeedback ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
            )}
          >
            <MessageSquareTextIcon className="me-1.5 inline size-4" aria-hidden />
            {t('visits.filters.hasFeedback')}
          </button>
        </div>
      )}

      {visits.isLoading && rows.length === 0 ? (
        <LoadingState rows={4} />
      ) : visits.error && !visits.data && rows.length === 0 ? (
        <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={
            filtered ? t('states.noMatches') : day > today ? t('visits.emptyFutureDay') : t('visits.emptyDay')
          }
          description={filtered ? t('states.noMatchesHint') : undefined}
        />
      ) : (
        <ul className="space-y-2" data-testid="visit-list">
          {shown.map((v) => {
            const sync = visitSyncState(v.id, outbox)
            return (
              <li key={v.id}>
                <Card className="gap-2 py-3 transition-colors hover:bg-accent/50">
                  <CardContent className="grid gap-2 px-4">
                    <Link
                      to={
                        v.status === 'inProgress' && sync !== 'refused'
                          ? '/rep/visits/active'
                          : '/rep/visits/$visitId'
                      }
                      params={{ visitId: v.id }}
                      className="grid gap-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            <AmBadge type={v.customerType} className="me-1.5" />
                            {localizedName(v.customerName, v.customerNameAr)}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span
                              className="inline-flex items-center gap-1 tabular-nums"
                              data-testid="visit-time"
                            >
                              <ClockIcon className="size-3.5" aria-hidden />
                              {formatTime(v.checkInAt)}
                              {v.checkOutAt && ` - ${formatTime(v.checkOutAt)}`}
                            </span>
                            {v.customerTerritoryName && (
                              <span className="inline-flex items-center gap-1" data-testid="visit-area">
                                <MapPinIcon className="size-3.5" aria-hidden />
                                {localizedName(v.customerTerritoryName, v.customerTerritoryNameAr)}
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge variant={STATUS_BADGE[v.status]} data-testid={`status-${v.status}`}>
                          {t(`visits.statuses.${v.status}`)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {v.needsReview && (
                          <Badge variant="destructive" data-testid="status-review">
                            {t('visits.needsReview')}
                          </Badge>
                        )}
                        {sync !== 'sent' && <VisitSyncBadge visitId={v.id} />}
                        {v.feedbackCategory ? (
                          <Badge variant={CATEGORY_BADGE[v.feedbackCategory]}>
                            {t(`visits.feedback.categories.${v.feedbackCategory}`)}
                          </Badge>
                        ) : (
                          v.hasFeedback && <Badge variant="secondary">{t('visits.feedback.title')}</Badge>
                        )}
                        {(v.productCount ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <PackageIcon className="size-3.5" aria-hidden />
                            {formatNumber(v.productCount ?? 0)}
                          </span>
                        )}
                        {(v.replyCount ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquareTextIcon className="size-3.5" aria-hidden />
                            {formatNumber(v.replyCount ?? 0)}
                          </span>
                        )}
                      </div>
                    </Link>
                    {(sync === 'waiting' || sync === 'refused') && (
                      <Button
                        variant="outline"
                        size="lg"
                        disabled={retrying === v.id}
                        onClick={() => void retry(v.id, sync === 'refused')}
                        data-testid="visit-retry"
                      >
                        <RotateCcwIcon className={retrying === v.id ? 'animate-spin' : undefined} />
                        {t('visits.sync.retry')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setLimit((n) => n + PAGE)}
          data-testid="visits-more"
        >
          {t('visits.showMore')}
        </Button>
      )}

      {seesExpenses && (
        <>
          <DayExpensesCard day={day} mode="own" showMonthLink />
          <MonthExpensesCard month={monthOf(day)} />
        </>
      )}
    </div>
  )
}

function DayTotal({
  label,
  value,
  attention = false,
}: {
  label: string
  value: string
  attention?: boolean
}) {
  return (
    <div className="grid gap-0.5 rounded-control border bg-card px-1 py-2">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('text-base font-bold tabular-nums', attention && 'text-destructive')}>{value}</dd>
    </div>
  )
}
