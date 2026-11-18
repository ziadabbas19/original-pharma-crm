import { Link } from '@tanstack/react-router'
import { ClipboardListIcon, CloudOffIcon, MessageSquareTextIcon, PackageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsList } from '@/api/generated/endpoints'
import type { VisitListItemDto } from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime, formatNumber, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { CATEGORY_BADGE, STATUS_BADGE } from './visit-labels'
import { useVisitOutbox } from './visit-outbox'

const DAY_MS = 86_400_000
const CACHE_KEY = 'my-visits'

function lastThirtyDays() {
  const to = new Date(Date.now() + DAY_MS)
  to.setHours(0, 0, 0, 0)
  return { mine: true, from: new Date(to.getTime() - 30 * DAY_MS).toISOString(), to: to.toISOString() }
}

/** "My visits" in the rep app: the last 30 days, with feedback and products at a glance. */
export function RepVisitsPage() {
  const { t } = useTranslation()
  const outbox = useVisitOutbox()
  const [params] = useState(lastThirtyDays)
  const copy = readCache<VisitListItemDto[]>(CACHE_KEY)
  const visits = useVisitsList(params, {
    query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 30_000 },
  })

  useEffect(() => {
    if (visits.data && visits.isFetchedAfterMount) writeCache(CACHE_KEY, visits.data)
  }, [visits.data, visits.isFetchedAfterMount])

  const waiting = new Set(outbox.pending.map((i) => i.payload.visitId))
  const refused = new Set(outbox.failed.map((i) => i.payload.visitId))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('visits.mine')}</h1>
      {visits.isLoading ? (
        <LoadingState rows={5} />
      ) : visits.error && !visits.data ? (
        <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : !visits.data?.length ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={t('visits.emptyMine')}
          description={t('visits.emptyMineHint')}
        />
      ) : (
        <ul className="space-y-2">
          {visits.data.map((v) => (
            <li key={v.id}>
              <Link to="/rep/visits/$visitId" params={{ visitId: v.id }} className="block">
                <Card className="py-3 transition-colors hover:bg-accent/50">
                  <CardContent className="grid gap-1.5 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {localizedName(v.customerName, v.customerNameAr)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(v.checkInAt)}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE[v.status]}>{t(`visits.statuses.${v.status}`)}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                      {waiting.has(v.id) && (
                        <Badge variant="warning">
                          <CloudOffIcon aria-hidden />
                          {t('orders.waitingToSync')}
                        </Badge>
                      )}
                      {refused.has(v.id) && <Badge variant="destructive">{t('visits.notSaved')}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
