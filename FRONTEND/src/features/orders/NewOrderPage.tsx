import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingState } from '@/components/states'
import { platform } from '@/lib/platform'
import { newClientRequestId } from './order-math'
import { discardFailedOrder, queueOrder, type FailedOrder } from './order-outbox'
import { fromRequest, toCreateRequest } from './order-request'
import { emptyOrderForm, type OrderFormValues } from './order-form-values'
import { OrderForm } from './OrderForm'
import { useOrderReferenceData } from './use-order-data'

const route = getRouteApi('/rep/orders/new')

/** New order. Always saved through the outbox, so it works the same online and offline. */
export function NewOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { retry } = route.useSearch()
  const { products } = useOrderReferenceData()
  const [initial, setInitial] = useState<OrderFormValues | null>(
    retry === undefined ? emptyOrderForm() : null,
  )
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  // "Fix and send again": start from the refused request.
  useEffect(() => {
    if (retry === undefined || initial || !products.data) return
    void platform()
      .offlineDb.peek<FailedOrder>('order-failed', 200)
      .then((items) => {
        const item = items.find((i) => i.id === retry)
        setInitial(item ? fromRequest(item.payload.request, products.data) : emptyOrderForm())
      })
  }, [retry, initial, products.data])

  const submit = async (values: OrderFormValues, estimatedTotal: number) => {
    setBusy(true)
    setError(null)
    try {
      await queueOrder(toCreateRequest(values, newClientRequestId()), estimatedTotal)
      if (retry !== undefined) await discardFailedOrder(retry)
      await navigate({ to: '/rep/orders' })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('orders.new')}</h1>
      {initial ? (
        <OrderForm
          initial={initial}
          submitLabel={t('orders.form.submit')}
          busy={busy}
          error={error}
          onSubmit={submit}
          onCancel={() => void navigate({ to: '/rep/orders' })}
        />
      ) : (
        <LoadingState rows={6} />
      )}
    </div>
  )
}
