import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon, PencilIcon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getOrdersGetQueryKey,
  useOrdersCancel,
  useOrdersGet,
  useOrdersUpdate,
} from '@/api/generated/endpoints'
import type { OrderDto } from '@/api/generated/model'
import { ErrorState, FormError, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { fromOrder, toUpdateRequest } from './order-request'
import { OrderDetails } from './OrderDetails'
import { OrderForm } from './OrderForm'
import { useOrderReferenceData } from './use-order-data'

const route = getRouteApi('/rep/orders/$orderId')

export function RepOrderDetailPage() {
  const { t, i18n } = useTranslation()
  const { orderId } = route.useParams()
  const queryClient = useQueryClient()
  const order = useOrdersGet(orderId)
  const { products } = useOrderReferenceData()
  const update = useOrdersUpdate()
  const cancel = useOrdersCancel()
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const Back = i18n.dir() === 'rtl' ? ArrowRightIcon : ArrowLeftIcon

  const done = async (updated: OrderDto) => {
    queryClient.setQueryData(getOrdersGetQueryKey(updated.id), updated)
    await queryClient.invalidateQueries({ queryKey: ['/api/orders'] })
    setEditing(false)
    setCancelling(false)
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link to="/rep/orders">
          <Back />
          {t('orders.mine')}
        </Link>
      </Button>
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
              await done(await update.mutateAsync({ id: orderId, data: toUpdateRequest(values) }))
            } catch (e) {
              setError(e)
            }
          }}
        />
      ) : (
        <>
          <Card className="py-4">
            <CardContent className="px-4">
              <OrderDetails order={order.data} />
            </CardContent>
          </Card>
          {(order.data.canEdit || order.data.canCancel) && !cancelling && (
            <div className="flex gap-2">
              {order.data.canEdit && (
                <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
                  <PencilIcon />
                  {t('orders.edit')}
                </Button>
              )}
              {order.data.canCancel && (
                <Button
                  variant="outline"
                  className="flex-1 text-destructive"
                  onClick={() => setCancelling(true)}
                >
                  <XCircleIcon />
                  {t('orders.cancel')}
                </Button>
              )}
            </div>
          )}
          {cancelling && (
            <Card className="py-4">
              <CardContent className="grid gap-3 px-4">
                <p className="text-sm font-medium">{t('orders.cancelConfirm')}</p>
                <Textarea
                  rows={2}
                  maxLength={500}
                  value={reason}
                  placeholder={t('orders.reasonOptional')}
                  onChange={(e) => setReason(e.target.value)}
                />
                <FormError error={error} />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setCancelling(false)}>
                    {t('common.back')}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={cancel.isPending}
                    onClick={async () => {
                      setError(null)
                      try {
                        await done(
                          await cancel.mutateAsync({ id: orderId, data: { reason: reason.trim() || null } }),
                        )
                      } catch (e) {
                        setError(e)
                      }
                    }}
                  >
                    {cancel.isPending && <Loader2Icon className="animate-spin" />}
                    {t('orders.cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
