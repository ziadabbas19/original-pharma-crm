import { Loader2Icon, PackagePlusIcon, XIcon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductDto, VisitDetailDto, VisitFeedbackCategory } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { productName } from '@/features/orders/order-labels'
import { ProductPicker, ProductThumb } from '@/features/orders/ProductPicker'
import { useOrderReferenceData } from '@/features/orders/use-order-data'
import { cn } from '@/lib/utils'
import { FEEDBACK_CATEGORIES } from './visit-labels'
import { queueVisitContent } from './visit-outbox'

interface PickedProduct {
  productId: string
  nameAr: string
  nameEn: string
  thumbnailUrl?: string | null
  note: string
}

/** The rep's feedback and products discussed. Saved through the device outbox, so it works offline. */
export function VisitContentForm({ visit, onSaved }: { visit: VisitDetailDto; onSaved: () => void }) {
  const { t, i18n } = useTranslation()
  const { products, lines } = useOrderReferenceData()
  const [text, setText] = useState(visit.feedback?.text ?? '')
  const [category, setCategory] = useState<VisitFeedbackCategory | null>(visit.feedback?.category ?? null)
  const [picked, setPicked] = useState<PickedProduct[]>(
    visit.products.map((p) => ({
      productId: p.productId,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      thumbnailUrl: p.thumbnailUrl,
      note: p.note ?? '',
    })),
  )
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const quantities = useMemo(() => Object.fromEntries(picked.map((p) => [p.productId, 1])), [picked])

  const add = (product: ProductDto) =>
    setPicked((current) =>
      current.some((p) => p.productId === product.id)
        ? current
        : [
            ...current,
            {
              productId: product.id,
              nameAr: product.nameAr,
              nameEn: product.nameEn,
              thumbnailUrl: product.thumbnailUrl,
              note: '',
            },
          ],
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await queueVisitContent(visit.id, visit.customerName, {
        feedback: text.trim() ? { text: text.trim(), category } : null,
        products: picked.map((p) => ({ productId: p.productId, note: p.note.trim() || null })),
        clientUpdatedAt: new Date().toISOString(),
      })
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
      <div className="grid gap-2">
        <Label htmlFor="visit-feedback">{t('visits.feedback.title')}</Label>
        <Textarea
          id="visit-feedback"
          rows={4}
          maxLength={2000}
          value={text}
          placeholder={t('visits.feedback.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label id="visit-category">{t('visits.feedback.category')}</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="visit-category">
          {FEEDBACK_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(category === value ? null : value)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                category === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {t(`visits.feedback.categories.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t('visits.products.title')}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>
            <PackagePlusIcon />
            {t('visits.products.add')}
          </Button>
        </div>
        {picked.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('visits.products.none')}</p>
        ) : (
          <ul className="grid gap-2">
            {picked.map((product) => (
              <li key={product.productId} className="grid gap-2 rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <ProductThumb url={product.thumbnailUrl} className="size-10" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {productName(product, i18n.resolvedLanguage)}
                  </p>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t('visits.products.remove')}
                    onClick={() => setPicked((all) => all.filter((p) => p.productId !== product.productId))}
                  >
                    <XIcon />
                  </Button>
                </div>
                <Input
                  value={product.note}
                  maxLength={300}
                  placeholder={t('visits.products.notePlaceholder')}
                  aria-label={t('visits.products.notePlaceholder')}
                  onChange={(e) =>
                    setPicked((all) =>
                      all.map((p) =>
                        p.productId === product.productId ? { ...p, note: e.target.value } : p,
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormError error={error} />
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2Icon className="animate-spin" />}
        {t('common.save')}
      </Button>

      <ProductPicker
        open={picker}
        onOpenChange={setPicker}
        products={products.data ?? []}
        lines={lines.data ?? []}
        quantities={quantities}
        onAdd={add}
      />
    </form>
  )
}
