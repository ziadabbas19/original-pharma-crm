import { useQueryClient } from '@tanstack/react-query'
import { CheckCheckIcon, Loader2Icon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getVisitsGetQueryKey,
  useVisitsGet,
  useVisitsMarkFeedbackSeen,
  useVisitsReply,
} from '@/api/generated/endpoints'
import type { VisitDetailDto } from '@/api/generated/model'
import { ErrorState, FormError, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { STATUS_BADGE } from './visit-labels'
import { VisitContentView } from './VisitContentView'
import { VisitOrdersList } from './VisitOrdersList'
import { VisitVerificationCard } from './VisitVerificationCard'

/** A visit on the dashboard: check-in facts, the rep's feedback and products, seen marker and reply. */
export function VisitDetailSheet({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const visit = useVisitsGet(visitId)
  const seen = useVisitsMarkFeedbackSeen()
  const reply = useVisitsReply()
  const [text, setText] = useState('')
  const [error, setError] = useState<unknown>(null)

  const applied = async (updated: VisitDetailDto) => {
    queryClient.setQueryData(getVisitsGetQueryKey(visitId), updated)
    await invalidateApi(queryClient, '/api/visits', '/api/notifications')
  }

  const markSeen = async () => {
    setError(null)
    try {
      await applied(await seen.mutateAsync({ visitId }))
    } catch (e) {
      setError(e)
    }
  }

  const send = async () => {
    setError(null)
    try {
      await applied(await reply.mutateAsync({ visitId, data: { text: text.trim() } }))
      setText('')
    } catch (e) {
      setError(e)
    }
  }

  const data = visit.data
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {data ? localizedName(data.customerName, data.customerNameAr) : t('visits.detail')}
          </SheetTitle>
          <SheetDescription>{data ? data.repName : t('common.loading')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          {visit.isLoading ? (
            <LoadingState rows={6} />
          ) : visit.error || !data ? (
            <ErrorState error={visit.error} onRetry={() => void visit.refetch()} />
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t('visits.status')}</dt>
                <dd>
                  <Badge variant={STATUS_BADGE[data.status]}>{t(`visits.statuses.${data.status}`)}</Badge>
                  {data.needsReview && (
                    <Badge variant="destructive" className="ms-1">
                      {t('visits.needsReview')}
                    </Badge>
                  )}
                </dd>
                <dt className="text-muted-foreground">{t('visits.checkIn')}</dt>
                <dd className="tabular-nums">{formatDateTime(data.checkInAt)}</dd>
                {data.checkOutAt && (
                  <>
                    <dt className="text-muted-foreground">{t('visits.checkOut')}</dt>
                    <dd className="tabular-nums">{formatDateTime(data.checkOutAt)}</dd>
                  </>
                )}
                {data.notes && (
                  <>
                    <dt className="text-muted-foreground">{t('orders.notes')}</dt>
                    <dd className="whitespace-pre-line">{data.notes}</dd>
                  </>
                )}
              </dl>

              <VisitVerificationCard visit={data} />

              <VisitOrdersList orders={data.orders} app="admin" />

              <VisitContentView visit={data} />

              {data.canMarkSeen && (
                <Button
                  variant="outline"
                  className="w-fit"
                  disabled={seen.isPending}
                  onClick={() => void markSeen()}
                >
                  {seen.isPending ? <Loader2Icon className="animate-spin" /> : <CheckCheckIcon />}
                  {t('visits.feedback.markSeen')}
                </Button>
              )}

              {data.canReply && (
                <div className="grid gap-2 rounded-lg border p-3">
                  <Label htmlFor="visit-reply">{t('visits.feedback.reply')}</Label>
                  <Textarea
                    id="visit-reply"
                    rows={2}
                    maxLength={500}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <Button
                    className="w-fit"
                    disabled={reply.isPending || !text.trim()}
                    onClick={() => void send()}
                  >
                    {reply.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                    {t('common.send')}
                  </Button>
                </div>
              )}
              <FormError error={error} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
