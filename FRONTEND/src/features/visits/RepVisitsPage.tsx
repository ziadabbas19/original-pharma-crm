import { Link } from '@tanstack/react-router'
import { ClipboardListIcon, MessageSquareTextIcon, PackageIcon, RotateCcwIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsList } from '@/api/generated/endpoints'
import type { VisitListItemDto, VisitStatus } from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { productName } from '@/features/orders/order-labels'
import { useOrderReferenceData } from '@/features/orders/use-order-data'
import { formatDateTime, formatNumber, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { cn } from '@/lib/utils'
import { CATEGORY_BADGE, STATUS_BADGE } from './visit-labels'
import { retryVisit, syncVisits, useVisitOutbox, visitSyncState } from './visit-outbox'
import type { CheckInStep } from './visit-queue'
import { VisitSyncBadge } from './VisitSyncBadge'

const DAY_MS = 86_400_000
const CACHE_KEY = 'my-visits'
const PRESETS = ['today', 'week', 'month'] as const
type Preset = (typeof PRESETS)[number]
const PRESET_DAYS: Record<Preset, number> = { today: 1, week: 7, month: 30 }

function lastThirtyDays() {
  const to = new Date(Date.now() + DAY_MS)
  to.setHours(0, 0, 0, 0)
  return { mine: true, from: new Date(to.getTime() - 30 * DAY_MS).toISOString(), to: to.toISOString() }
}

function presetStart(preset: Preset): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime() - (PRESET_DAYS[preset] - 1) * DAY_MS
}

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

/** "My visits": the last 30 days with filters, plus everything still waiting on this device. */
export function RepVisitsPage() {
  const { t, i18n } = useTranslation()
  const outbox = useVisitOutbox()
  const { products } = useOrderReferenceData()
  const [params] = useState(lastThirtyDays)
  const [preset, setPreset] = useState<Preset>('month')
  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [withFeedback, setWithFeedback] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const copy = readCache<VisitListItemDto[]>(CACHE_KEY)
  const visits = useVisitsList(params, {
    query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 30_000 },
  })

  useEffect(() => {
    if (visits.data && visits.isFetchedAfterMount) writeCache(CACHE_KEY, visits.data)
  }, [visits.data, visits.isFetchedAfterMount])

  const rows = useMemo(() => {
    const known = new Set((visits.data ?? []).map((v) => v.id))
    const queued = [...outbox.steps, ...outbox.failedSteps].map((i) => i.payload)
    const closing = new Set(queued.filter((s) => s.type === 'checkOut').map((s) => s.visitId))
    const local = queued
      .filter((s): s is CheckInStep => s.type === 'checkIn' && !known.has(s.visitId))
      .map((s) => localRow(s, closing.has(s.visitId)))
    const server = (visits.data ?? []).map((v): VisitListItemDto =>
      closing.has(v.id) ? { ...v, status: 'completed' as VisitStatus } : v,
    )
    return [...local, ...server].sort((a, b) => b.checkInAt.localeCompare(a.checkInAt))
  }, [visits.data, outbox.steps, outbox.failedSteps])

  const customers = useMemo(() => {
    const byId = new Map(rows.map((v) => [v.customerId, localizedName(v.customerName, v.customerNameAr)]))
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const start = presetStart(preset)
    return rows.filter(
      (v) =>
        new Date(v.checkInAt).getTime() >= start &&
        (!customerId || v.customerId === customerId) &&
        (!productId || v.productIds.includes(productId)) &&
        (!withFeedback || v.hasFeedback),
    )
  }, [rows, preset, customerId, productId, withFeedback])

  const filtered = preset !== 'month' || customerId !== '' || productId !== '' || withFeedback

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

      <div className="grid gap-2">
        <div className="flex gap-2" role="group" aria-label={t('visits.filters.period')}>
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              onClick={() => setPreset(value)}
              data-testid={`preset-${value}`}
              className={cn(
                'min-h-11 flex-1 rounded-full border px-3 text-sm transition-colors',
                preset === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {t(`visits.filters.presets.${value}`)}
            </button>
          ))}
        </div>
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

      {visits.isLoading && rows.length === 0 ? (
        <LoadingState rows={5} />
      ) : visits.error && !visits.data && rows.length === 0 ? (
        <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={filtered ? t('states.noMatches') : t('visits.emptyMine')}
          description={filtered ? t('states.noMatchesHint') : t('visits.emptyMineHint')}
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
                            {localizedName(v.customerName, v.customerNameAr)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatDateTime(v.checkInAt)}
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
    </div>
  )
}
