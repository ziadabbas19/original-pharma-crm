import {
  AlertTriangleIcon,
  Loader2Icon,
  MinusIcon,
  PackagePlusIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrdersPlaces } from '@/api/generated/endpoints'
import type { ProductDto } from '@/api/generated/model'
import { ErrorState, FormError, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatMoney, formatNumber, formatPercent, localizedName, toDateInputValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import type { FormLine, OrderFormValues } from './order-form-values'
import { OTHER_METHOD, PLACE_TYPES, productName } from './order-labels'
import { estimateLine, estimateOrder, lowestCap } from './order-math'
import { ProductPicker, ProductThumb } from './ProductPicker'
import { useOrderReferenceData } from './use-order-data'

/** The order form of the rep app, also used to edit a submitted order. Totals shown here are estimates. */
export function OrderForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial: OrderFormValues
  submitLabel: string
  busy: boolean
  error: unknown
  onSubmit: (values: OrderFormValues, estimatedTotal: number) => void | Promise<void>
  onCancel?: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage
  const cap = useAppSelector((s) => s.auth.maxDiscountPercent)
  const { products, lines: productLines, methods } = useOrderReferenceData()
  const [values, setValues] = useState<OrderFormValues>(initial)
  const [picker, setPicker] = useState(false)
  const [touched, setTouched] = useState(false)
  const placeSearch = useDebouncedValue(values.placeName, 300)
  const places = useOrdersPlaces(
    { search: placeSearch || undefined },
    { query: { staleTime: 60_000, retry: false } },
  )

  const set = <K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const stockById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p.stockQuantity])),
    [products.data],
  )
  const maxById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p.effectiveMaxDiscountPercent ?? null])),
    [products.data],
  )
  const quantities = useMemo(
    () => Object.fromEntries(values.lines.map((l) => [l.productId, l.quantity])),
    [values.lines],
  )
  const draft = values.lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPercent: Number(l.discount) || 0,
  }))
  const totals = estimateOrder(draft)

  const addProduct = (product: ProductDto) => {
    setValues((current) => {
      const existing = current.lines.find((l) => l.productId === product.id)
      return {
        ...current,
        lines: existing
          ? current.lines.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l))
          : [
              ...current.lines,
              {
                productId: product.id,
                nameAr: product.nameAr,
                nameEn: product.nameEn,
                thumbnailUrl: product.thumbnailUrl,
                unitPrice: product.price,
                stock: product.stockQuantity,
                quantity: 1,
                discount: defaultDiscountFor(product, cap),
                maxDiscount: product.effectiveMaxDiscountPercent ?? null,
              },
            ],
      }
    })
  }

  const updateLine = (productId: string, patch: Partial<FormLine>) =>
    setValues((current) => ({
      ...current,
      lines: current.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    }))

  /** The lowest of the product limit, the line limit and the role cap. */
  const lineCap = (line: FormLine): number | null =>
    lowestCap(maxById.get(line.productId) ?? line.maxDiscount, cap)

  const discountError = (line: FormLine): string | undefined => {
    const value = line.discount
    if (value.trim() === '') return undefined
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || n > 100) return t('orders.form.discountRange')
    if (Math.round(n * 100) !== n * 100) return t('orders.form.discountDecimals')
    const max = lineCap(line)
    if (max !== null && n > max) return t('orders.form.discountCap', { max: formatPercent(max) })
    return undefined
  }

  const problems = {
    placeName: values.placeName.trim() === '' ? t('forms.required') : undefined,
    collection:
      values.collection === ''
        ? t('orders.form.collectionRequired')
        : values.collection === OTHER_METHOD && values.collectionOther.trim() === ''
          ? t('orders.form.collectionOtherRequired')
          : undefined,
    lines: values.lines.length === 0 ? t('orders.form.noLines') : undefined,
    discount: values.lines.some((l) => discountError(l)),
    quantity: values.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1),
  }
  const valid =
    !problems.placeName && !problems.collection && !problems.lines && !problems.discount && !problems.quantity

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    void onSubmit(values, totals.total)
  }

  if (products.isLoading && !products.data) return <LoadingState rows={6} />
  if (products.error && !products.data)
    return <ErrorState error={products.error} onRetry={() => void products.refetch()} />

  const suggestionList = places.data ?? []

  return (
    <form className="grid gap-4" noValidate onSubmit={submit}>
      <Card className="py-4">
        <CardContent className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label>{t('orders.placeType')}</Label>
            <div
              className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
              role="radiogroup"
              aria-label={t('orders.placeType')}
            >
              {PLACE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={values.placeType === type}
                  onClick={() => set('placeType', type)}
                  className={cn(
                    'rounded-md px-1 py-1.5 text-xs font-medium text-muted-foreground',
                    values.placeType === type && 'bg-background text-foreground shadow-xs',
                  )}
                >
                  {t(`orders.placeTypes.${type}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="place-name">{t('orders.place')}</Label>
            <Input
              id="place-name"
              list="place-suggestions"
              autoComplete="off"
              value={values.placeName}
              onChange={(e) => {
                const name = e.target.value
                const match = suggestionList.find((p) => p.name === name)
                setValues((current) => ({
                  ...current,
                  placeName: name,
                  customerId: match?.customerId ?? null,
                  placeType: match?.placeType ?? current.placeType,
                }))
              }}
              aria-invalid={touched && !!problems.placeName}
              placeholder={t('orders.form.placePlaceholder')}
            />
            <datalist id="place-suggestions">
              {suggestionList.map((p) => (
                <option key={`${p.name}-${p.placeType}-${p.customerId ?? ''}`} value={p.name}>
                  {t(`orders.placeTypes.${p.placeType}`)}
                </option>
              ))}
            </datalist>
            {touched && problems.placeName && (
              <p className="text-sm text-destructive">{problems.placeName}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="order-date">{t('orders.date')}</Label>
              <Input
                id="order-date"
                type="date"
                dir="ltr"
                value={values.orderDate}
                max={toDateInputValue(new Date())}
                onChange={(e) => set('orderDate', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collection">{t('orders.collectionMethod')}</Label>
              <NativeSelect
                id="collection"
                value={values.collection}
                onChange={(e) => set('collection', e.target.value)}
                aria-invalid={touched && !!problems.collection}
              >
                <option value="">{t('orders.form.choose')}</option>
                {(methods.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {localizedName(m.nameEn, m.nameAr)}
                  </option>
                ))}
                <option value={OTHER_METHOD}>{t('orders.form.otherMethod')}</option>
              </NativeSelect>
            </div>
          </div>
          {values.collection === OTHER_METHOD && (
            <div className="grid gap-2">
              <Label htmlFor="collection-other">{t('orders.form.otherMethodText')}</Label>
              <Input
                id="collection-other"
                value={values.collectionOther}
                maxLength={200}
                onChange={(e) => set('collectionOther', e.target.value)}
                aria-invalid={touched && !!problems.collection}
              />
            </div>
          )}
          {touched && problems.collection && (
            <p className="text-sm text-destructive">{problems.collection}</p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">
            {t('orders.lines')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({formatNumber(values.lines.length)})
            </span>
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>
            <PackagePlusIcon />
            {t('orders.form.addProducts')}
          </Button>
        </div>
        {values.lines.length === 0 ? (
          <button
            type="button"
            onClick={() => setPicker(true)}
            className={cn(
              'rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-accent',
              touched && problems.lines && 'border-destructive text-destructive',
            )}
          >
            {t('orders.form.noLines')}
          </button>
        ) : (
          <ul className="grid gap-2">
            {values.lines.map((line) => {
              const estimate = estimateLine({
                productId: line.productId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountPercent: Number(line.discount) || 0,
              })
              const stock = stockById.get(line.productId) ?? line.stock
              const overStock = stock !== null && line.quantity > stock
              const lineDiscountError = discountError(line)
              const maxForLine = lineCap(line)
              return (
                <li key={line.productId}>
                  <Card className="gap-3 py-3">
                    <CardContent className="grid gap-3 px-3">
                      <div className="flex items-start gap-3">
                        <ProductThumb url={line.thumbnailUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="leading-snug font-medium">{productName(line, language)}</p>
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {formatMoney(line.unitPrice)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('orders.form.removeLine')}
                          onClick={() =>
                            set(
                              'lines',
                              values.lines.filter((l) => l.productId !== line.productId),
                            )
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground" htmlFor={`qty-${line.productId}`}>
                            {t('orders.quantity')}
                          </Label>
                          <div className="flex items-center" dir="ltr">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="rounded-e-none"
                              aria-label={t('orders.form.less')}
                              onClick={() =>
                                updateLine(line.productId, { quantity: Math.max(1, line.quantity - 1) })
                              }
                            >
                              <MinusIcon />
                            </Button>
                            <Input
                              id={`qty-${line.productId}`}
                              inputMode="numeric"
                              className="h-9 w-16 rounded-none text-center tabular-nums"
                              value={String(line.quantity)}
                              onChange={(e) => {
                                const n = Number(e.target.value.replace(/[^0-9]/g, ''))
                                updateLine(line.productId, { quantity: Number.isFinite(n) ? n : 0 })
                              }}
                              aria-invalid={line.quantity < 1}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="rounded-s-none"
                              aria-label={t('orders.form.more')}
                              onClick={() => updateLine(line.productId, { quantity: line.quantity + 1 })}
                            >
                              <PlusIcon />
                            </Button>
                          </div>
                        </div>
                        <div className="grid w-24 gap-1">
                          <Label className="text-xs text-muted-foreground" htmlFor={`disc-${line.productId}`}>
                            {t('orders.discountPercent')}
                          </Label>
                          <Input
                            id={`disc-${line.productId}`}
                            inputMode="decimal"
                            dir="ltr"
                            placeholder="0"
                            value={line.discount}
                            onChange={(e) =>
                              updateLine(line.productId, { discount: e.target.value.replace(',', '.') })
                            }
                            aria-invalid={!!lineDiscountError}
                          />
                          {maxForLine !== null && (
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {t('catalog.maxShort', { value: formatPercent(maxForLine) })}
                            </p>
                          )}
                        </div>
                        <div className="ms-auto text-end">
                          <p className="text-xs text-muted-foreground">{t('orders.lineTotal')}</p>
                          <p className="font-semibold tabular-nums">{formatMoney(estimate.total)}</p>
                        </div>
                      </div>
                      {lineDiscountError && <p className="text-sm text-destructive">{lineDiscountError}</p>}
                      {overStock && (
                        <p className="flex items-center gap-1.5 text-sm text-warning">
                          <AlertTriangleIcon className="size-4 shrink-0" />
                          {t('orders.form.overStock', { stock: formatNumber(stock ?? 0) })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-2">
        <Label htmlFor="notes">{t('orders.notes')}</Label>
        <Textarea
          id="notes"
          rows={2}
          maxLength={2000}
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <Card className="gap-2 py-4">
        <CardContent className="grid gap-1.5 px-4 text-sm">
          <Row label={t('orders.subtotal')} value={formatMoney(totals.subtotal)} />
          <Row label={t('orders.discount')} value={formatMoney(-totals.discount)} />
          <div className="mt-1 flex items-center justify-between border-t pt-2 text-base font-semibold">
            <span>{t('orders.total')}</span>
            <span className="tabular-nums">{formatMoney(totals.total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('orders.form.estimateHint')}</p>
        </CardContent>
      </Card>

      <FormError error={error} />
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>

      <ProductPicker
        open={picker}
        onOpenChange={setPicker}
        products={products.data ?? []}
        lines={productLines.data ?? []}
        quantities={quantities}
        onAdd={addProduct}
      />
    </form>
  )
}

/** The product's default discount (else its line's), never above what this user may give. */
function defaultDiscountFor(product: ProductDto, roleCap: number | null): string {
  const value = product.effectiveDefaultDiscountPercent
  if (value === null || value === undefined) return ''
  const max = lowestCap(product.effectiveMaxDiscountPercent, roleCap)
  return String(max !== null ? Math.min(value, max) : value)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
