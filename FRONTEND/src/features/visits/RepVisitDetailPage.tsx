import { getRouteApi, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloudOffIcon,
  PencilIcon,
  RotateCcwIcon,
  TimerIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsGet, visitsMarkFeedbackSeen } from '@/api/generated/endpoints'
import type { ProductDto, UpdateVisitContentRequest, VisitDetailDto } from '@/api/generated/model'
import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useOrderReferenceData } from '@/features/orders/use-order-data'
import { getErrorMessage, restoreError } from '@/lib/errors'
import { formatDateTime, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { readCache, writeCache } from '@/lib/offline-cache'
import { useActiveVisit } from './active-visit'
import { STATUS_BADGE } from './visit-labels'
import { retryVisit, useVisitOutbox } from './visit-outbox'
import type { CheckInStep } from './visit-queue'
import { VisitContentForm } from './VisitContentForm'
import { VisitContentView } from './VisitContentView'
import { VisitOrdersList } from './VisitOrdersList'
import { VisitSyncBadge } from './VisitSyncBadge'
import { VisitVerificationCard } from './VisitVerificationCard'

const route = getRouteApi('/rep/visits/$visitId')

/** The visit as the rep last saved it on this device, while that edit waits to be sent. */
function withUnsentContent(
  visit: VisitDetailDto,
  request: UpdateVisitContentRequest,
  queuedAt: string,
  catalog: ProductDto[],
): VisitDetailDto {
  const known = new Map(visit.products.map((p) => [p.productId, p]))
  const products = new Map(catalog.map((p) => [p.id, p]))
  return {
    ...visit,
    feedback: request.feedback
      ? {
          text: request.feedback.text,
          category: request.feedback.category ?? null,
          createdAt: visit.feedback?.createdAt ?? queuedAt,
          updatedAt: queuedAt,
          seenBy: [],
        }
      : null,
    products: request.products.flatMap((input) => {
      const note = input.note ?? null
      const existing = known.get(input.productId)
      if (existing) return [{ ...existing, note }]
      const product = products.get(input.productId)
      if (!product) return []
      return [
        {
          productId: product.id,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          thumbnailUrl: product.thumbnailUrl ?? null,
          productLineId: product.productLineId ?? null,
          note,
        },
      ]
    }),
  }
}

/** A visit that has not reached the server yet: what the device knows, and a way to send it again. */
function LocalVisit({ step, refusedMessage }: { step: CheckInStep; refusedMessage: string | null }) {
  const { t } = useTranslation()
  return (
    <>
      <Card className="py-4">
        <CardContent className="grid gap-2 px-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-semibold">
              {localizedName(step.customer.name, step.customer.nameAr)}
            </h1>
            <VisitSyncBadge visitId={step.visitId} />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatDateTime(step.request.timestamp)}
          </p>
        </CardContent>
      </Card>
      <Alert variant={refusedMessage ? 'destructive' : 'warning'} data-testid="local-visit">
        <CloudOffIcon />
        <AlertDescription>{refusedMessage ?? t('visits.sync.waitingHint')}</AlertDescription>
      </Alert>
      <Button variant="outline" size="lg" className="w-full" onClick={() => void retryVisit(step.visitId)}>
        <RotateCcwIcon />
        {t('visits.sync.retry')}
      </Button>
    </>
  )
}

export function RepVisitDetailPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { visitId } = route.useParams()
  const cacheKey = `visit.${visitId}`
  const copy = readCache<VisitDetailDto>(cacheKey)
  const visit = useVisitsGet(visitId, {
    query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 15_000 },
  })
  const outbox = useVisitOutbox()
  const { visit: active } = useActiveVisit()
  const { products } = useOrderReferenceData()
  const [editing, setEditing] = useState(false)
  const Back = i18n.dir() === 'rtl' ? ArrowRightIcon : ArrowLeftIcon
  const seenFor = useRef<string | null>(null)

  useEffect(() => {
    if (visit.data && visit.isFetchedAfterMount) writeCache(cacheKey, visit.data)
  }, [cacheKey, visit.data, visit.isFetchedAfterMount])

  // Opening the visit counts as reading the supervisor's replies: their notifications are marked read.
  const hasFeedback = Boolean(visit.data?.feedback)
  useEffect(() => {
    if (!hasFeedback || seenFor.current === visitId) return
    seenFor.current = visitId
    void visitsMarkFeedbackSeen(visitId)
      .then(() => invalidateApi(queryClient, '/api/notifications'))
      .catch(() => {
        seenFor.current = null
      })
  }, [hasFeedback, visitId, queryClient])

  const localStep = [...outbox.steps, ...outbox.failedSteps]
    .map((i) => i.payload)
    .find((s): s is CheckInStep => s.type === 'checkIn' && s.visitId === visitId)
  const refusedStep = outbox.failedSteps.find((i) => i.payload.visitId === visitId)
  const refusedMessage = refusedStep ? getErrorMessage(restoreError(refusedStep.payload.error), t) : null

  const unsent = outbox.pending.find((i) => i.payload.visitId === visitId)
  const waiting = unsent !== undefined || outbox.steps.some((i) => i.payload.visitId === visitId)
  const refused = outbox.failed.find((i) => i.payload.visitId === visitId)
  const data =
    visit.data && unsent
      ? withUnsentContent(visit.data, unsent.payload.request, unsent.payload.queuedAt, products.data ?? [])
      : visit.data

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="lg" className="-ms-2">
        <Link to="/rep/visits">
          <Back />
          {t('visits.mine')}
        </Link>
      </Button>
      {!data && localStep ? (
        <LocalVisit step={localStep} refusedMessage={refusedMessage} />
      ) : visit.isLoading ? (
        <LoadingState rows={6} />
      ) : visit.error && !data ? (
        <ErrorState error={visit.error} onRetry={() => void visit.refetch()} />
      ) : data ? (
        <>
          <Card className="py-4">
            <CardContent className="grid gap-1 px-4">
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-lg font-semibold">
                  {localizedName(data.customerName, data.customerNameAr)}
                </h1>
                <Badge variant={STATUS_BADGE[data.status]}>{t(`visits.statuses.${data.status}`)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">{formatDateTime(data.checkInAt)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {data.needsReview && <Badge variant="destructive">{t('visits.needsReview')}</Badge>}
                <VisitSyncBadge visitId={visitId} />
              </div>
            </CardContent>
          </Card>

          {active?.visitId === visitId && (
            <Button asChild size="lg" className="w-full">
              <Link to="/rep/visits/active">
                <TimerIcon />
                {t('visits.continue')}
              </Link>
            </Button>
          )}

          {waiting && (
            <Alert variant="warning">
              <CloudOffIcon />
              <AlertDescription>{t('visits.waitingHint')}</AlertDescription>
            </Alert>
          )}
          {refusedStep && (
            <Alert variant="destructive" data-testid="visit-refused">
              <AlertDescription className="grid gap-2">
                <p>{refusedMessage}</p>
                <Button variant="outline" size="lg" onClick={() => void retryVisit(visitId)}>
                  <RotateCcwIcon />
                  {t('visits.sync.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {refused && (
            <Alert variant="destructive">
              <AlertDescription>{getErrorMessage(restoreError(refused.payload.error), t)}</AlertDescription>
            </Alert>
          )}

          <VisitVerificationCard visit={data} />

          {data.notes && (
            <Card className="gap-1 py-3">
              <CardContent className="grid gap-1 px-4 text-sm">
                <p className="font-medium">{t('visits.checkOutFlow.savedNote')}</p>
                <p className="whitespace-pre-line text-muted-foreground">{data.notes}</p>
              </CardContent>
            </Card>
          )}

          <VisitOrdersList orders={data.orders} app="rep" />

          <Card className="py-4">
            <CardContent className="grid gap-4 px-4">
              {editing ? (
                <VisitContentForm
                  key={unsent?.id ?? 'saved'}
                  visit={data}
                  onSaved={() => setEditing(false)}
                />
              ) : (
                <>
                  <VisitContentView visit={data} />
                  {data.canEditContent ? (
                    <div className="grid gap-1">
                      <Button variant="outline" size="lg" onClick={() => setEditing(true)}>
                        <PencilIcon />
                        {t('visits.editContent')}
                      </Button>
                      {data.contentEditableUntil && (
                        <p className="text-center text-xs text-muted-foreground">
                          {t('visits.editableUntil', { date: formatDateTime(data.contentEditableUntil) })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('visits.contentClosed')}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
