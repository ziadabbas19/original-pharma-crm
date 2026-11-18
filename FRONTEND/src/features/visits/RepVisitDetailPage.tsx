import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, CloudOffIcon, PencilIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsGet } from '@/api/generated/endpoints'
import type { ProductDto, UpdateVisitContentRequest, VisitDetailDto } from '@/api/generated/model'
import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useOrderReferenceData } from '@/features/orders/use-order-data'
import { ApiError } from '@/lib/api-client'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { STATUS_BADGE } from './visit-labels'
import { useVisitOutbox } from './visit-outbox'
import { VisitContentForm } from './VisitContentForm'
import { VisitContentView } from './VisitContentView'

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

export function RepVisitDetailPage() {
  const { t, i18n } = useTranslation()
  const { visitId } = route.useParams()
  const cacheKey = `visit.${visitId}`
  const copy = readCache<VisitDetailDto>(cacheKey)
  const visit = useVisitsGet(visitId, {
    query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 15_000 },
  })
  const outbox = useVisitOutbox()
  const { products } = useOrderReferenceData()
  const [editing, setEditing] = useState(false)
  const Back = i18n.dir() === 'rtl' ? ArrowRightIcon : ArrowLeftIcon

  useEffect(() => {
    if (visit.data && visit.isFetchedAfterMount) writeCache(cacheKey, visit.data)
  }, [cacheKey, visit.data, visit.isFetchedAfterMount])

  const unsent = outbox.pending.find((i) => i.payload.visitId === visitId)
  const waiting = unsent !== undefined
  const refused = outbox.failed.find((i) => i.payload.visitId === visitId)
  const data =
    visit.data && unsent
      ? withUnsentContent(visit.data, unsent.payload.request, unsent.payload.queuedAt, products.data ?? [])
      : visit.data

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link to="/rep/visits">
          <Back />
          {t('visits.mine')}
        </Link>
      </Button>
      {visit.isLoading ? (
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
            </CardContent>
          </Card>

          {waiting && (
            <Alert variant="warning">
              <CloudOffIcon />
              <AlertDescription>{t('visits.waitingHint')}</AlertDescription>
            </Alert>
          )}
          {refused && (
            <Alert variant="destructive">
              <AlertDescription>
                {errorMessage(
                  new ApiError(refused.payload.error.status, {
                    code: refused.payload.error.code,
                    title: refused.payload.error.title,
                  }),
                  t,
                )}
              </AlertDescription>
            </Alert>
          )}

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
                      <Button variant="outline" onClick={() => setEditing(true)}>
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
