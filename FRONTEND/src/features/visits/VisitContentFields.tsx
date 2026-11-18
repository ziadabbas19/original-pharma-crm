import { PackagePlusIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductDto } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { productName } from '@/features/orders/order-labels'
import { ProductPicker, ProductThumb } from '@/features/orders/ProductPicker'
import { useOrderReferenceData } from '@/features/orders/use-order-data'
import { cn } from '@/lib/utils'
import type { VisitDraft } from './active-visit'
import { FEEDBACK_CATEGORIES } from './visit-labels'

/** Feedback with its category and the products discussed; used in the active visit and when editing later. */
export function VisitContentFields({
  value,
  onChange,
}: {
  value: VisitDraft
  onChange: (next: VisitDraft) => void
}) {
  const { t, i18n } = useTranslation()
  const { products, lines } = useOrderReferenceData()
  const [picker, setPicker] = useState(false)
  const quantities = useMemo(
    () => Object.fromEntries(value.products.map((p) => [p.productId, 1])),
    [value.products],
  )

  const add = (product: ProductDto) => {
    if (value.products.some((p) => p.productId === product.id)) return
    onChange({
      ...value,
      products: [
        ...value.products,
        {
          productId: product.id,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          thumbnailUrl: product.thumbnailUrl,
          note: '',
        },
      ],
    })
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t('visits.products.title')}</h3>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setPicker(true)}
            data-testid="add-products"
          >
            <PackagePlusIcon />
            {t('visits.products.add')}
          </Button>
        </div>
        {value.products.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('visits.products.none')}</p>
        ) : (
          <ul className="grid gap-2">
            {value.products.map((product) => (
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
                    className="size-11"
                    aria-label={t('visits.products.remove')}
                    onClick={() =>
                      onChange({
                        ...value,
                        products: value.products.filter((p) => p.productId !== product.productId),
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </div>
                <Input
                  className="h-11"
                  value={product.note}
                  maxLength={300}
                  placeholder={t('visits.products.notePlaceholder')}
                  aria-label={t('visits.products.notePlaceholder')}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      products: value.products.map((p) =>
                        p.productId === product.productId ? { ...p, note: e.target.value } : p,
                      ),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-2">
        <Label htmlFor="visit-feedback">{t('visits.feedback.title')}</Label>
        <Textarea
          id="visit-feedback"
          rows={4}
          maxLength={2000}
          value={value.text}
          placeholder={t('visits.feedback.placeholder')}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label id="visit-category">{t('visits.feedback.category')}</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="visit-category">
          {FEEDBACK_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={value.category === category}
              onClick={() => onChange({ ...value, category: value.category === category ? null : category })}
              className={cn(
                'min-h-11 rounded-full border px-4 text-sm transition-colors',
                value.category === category
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {t(`visits.feedback.categories.${category}`)}
            </button>
          ))}
        </div>
      </div>

      <ProductPicker
        open={picker}
        onOpenChange={setPicker}
        products={products.data ?? []}
        lines={lines.data ?? []}
        quantities={quantities}
        onAdd={add}
      />
    </div>
  )
}
