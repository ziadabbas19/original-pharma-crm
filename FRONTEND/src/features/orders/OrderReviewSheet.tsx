import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon, Loader2Icon, PencilIcon, TruckIcon, XCircleIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getOrdersGetQueryKey,
  useOrdersApprove,
  useOrdersCancel,
  useOrdersDeliver,
  useOrdersGet,
  useOrdersReject,
  useOrdersUpdate,
} from '@/api/generated/endpoints'
import type { OrderDto } from '@/api/generated/model'
import { ErrorState, FormError, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { fromOrder, toUpdateRequest } from './order-request'
import { OrderDetails } from './OrderDetails'
import { OrderForm } from './OrderForm'
import { useOrderReferenceData } from './use-order-data'

type Action = 'approve' | 'reject' | 'cancel' | 'deliver'

/** Order detail on the dashboard, with approve / reject / cancel / deliver when the API allows it. */
export function OrderReviewSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const order = useOrdersGet(orderId)
  const approve = useOrdersApprove()
  const reject = useOrdersReject()
  const cancel = useOrdersCancel()
  const deliver = useOrdersDeliver()
  const update = useOrdersUpdate()
  const { products } = useOrderReferenceData()
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [error, setError] = useState<unknown>(null)
  const busy = approve.isPending || reject.isPending || cancel.isPending || deliver.isPending

  const run = async (kind: Action) => {
    setError(null)
    if (kind === 'reject' && !reason.trim()) {
      setError(new Error())
      return
    }
    try {
      const data = { reason: reason.trim() || null, internalNote: internalNote.trim() || null }
      const mutation = { approve, reject, cancel, deliver }[kind]
      const updated: OrderDto = await mutation.mutateAsync({ id: orderId, data })
      queryClient.setQueryData(getOrdersGetQueryKey(orderId), updated)
      await queryClient.invalidateQueries({ queryKey: ['/api/orders'] })
      setAction(null)
      setReason('')
      setInternalNote('')
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('orders.detail')}</SheetTitle>
          <SheetDescription>{order.data ? order.data.placeName : t('common.loading')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          {order.isLoading ? (
            <LoadingState rows={6} />
          ) : order.error || !order.data ? (
            <ErrorState error={order.error} onRetry={() => void order.refetch()} />
          ) : editing ? (
            <OrderForm
              initial={fromOrder(order.data, products.data)}
              submitLabel={t('common.save')}
              busy={update.isPending}
              error={error}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                setError(null)
                try {
                  const updated = await update.mutateAsync({ id: orderId, data: toUpdateRequest(values) })
                  queryClient.setQueryData(getOrdersGetQueryKey(orderId), updated)
                  await queryClient.invalidateQueries({ queryKey: ['/api/orders'] })
                  setEditing(false)
                } catch (e) {
                  setError(e)
                }
              }}
            />
          ) : (
            <>
              <OrderDetails order={order.data} showRep />
              {action ? (
                <div className="grid gap-3 rounded-lg border p-3">
                  <Label htmlFor="order-reason">
                    {action === 'reject' ? t('orders.reasonRequired') : t('orders.reasonOptional')}
                  </Label>
                  <Textarea
                    id="order-reason"
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-invalid={action === 'reject' && error instanceof Error && !reason.trim()}
                  />
                  {action === 'reject' && error instanceof Error && !reason.trim() ? (
                    <p className="text-sm text-destructive">{t('orders.reasonMissing')}</p>
                  ) : (
                    <FormError error={error} />
                  )}
                  <Label htmlFor="order-internal-note">{t('orders.internalNote')}</Label>
                  <Textarea
                    id="order-internal-note"
                    rows={2}
                    maxLength={500}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('orders.internalNoteHint')}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setAction(null)}>
                      {t('common.back')}
                    </Button>
                    <Button
                      className="flex-1"
                      variant={action === 'approve' ? 'default' : 'destructive'}
                      disabled={busy}
                      onClick={() => void run(action)}
                    >
                      {busy && <Loader2Icon className="animate-spin" />}
                      {t(`orders.do.${action}`)}
                    </Button>
                  </div>
                </div>
              ) : (
                (order.data.canReview ||
                  order.data.canCancel ||
                  order.data.canDeliver ||
                  order.data.canEdit) && (
                  <div className="flex flex-wrap gap-2">
                    {order.data.canEdit && (
                      <Button variant="outline" onClick={() => setEditing(true)}>
                        <PencilIcon />
                        {t('orders.edit')}
                      </Button>
                    )}
                    {order.data.canDeliver && (
                      <Button onClick={() => setAction('deliver')}>
                        <TruckIcon />
                        {t('orders.do.deliver')}
                      </Button>
                    )}
                    {order.data.canReview && (
                      <>
                        <Button onClick={() => setAction('approve')}>
                          <CheckIcon />
                          {t('orders.do.approve')}
                        </Button>
                        <Button
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setAction('reject')}
                        >
                          <XIcon />
                          {t('orders.do.reject')}
                        </Button>
                      </>
                    )}
                    {order.data.canCancel && (
                      <Button variant="ghost" onClick={() => setAction('cancel')}>
                        <XCircleIcon />
                        {t('orders.do.cancel')}
                      </Button>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
