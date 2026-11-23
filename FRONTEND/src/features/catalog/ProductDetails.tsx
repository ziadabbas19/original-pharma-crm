import { useTranslation } from 'react-i18next'
import type { ProductDto } from '@/api/generated/model'
import { formatMoney, localizedName } from '@/lib/format'
import { BrochureGallery } from './BrochureGallery'

/** A product as reps and managers read it: brochure pages, price, line, description, indications, ingredients. */
export function ProductDetails({ product }: { product: ProductDto }) {
  const { t } = useTranslation()
  const name = localizedName(product.nameEn, product.nameAr)
  const sections: [string, string | null | undefined][] = [
    [t('catalog.description'), product.description],
    [t('catalog.indications'), product.indications],
    [t('catalog.ingredients'), product.ingredients],
  ]
  return (
    <div className="grid gap-4" data-testid="product-details">
      <BrochureGallery images={product.images ?? []} name={name} />
      <div className="grid gap-1">
        <p className="text-lg font-semibold tabular-nums" dir="ltr">
          {formatMoney(product.price)}
        </p>
        {(product.lineNameEn || product.lineNameAr) && (
          <p className="text-sm text-muted-foreground">
            {localizedName(product.lineNameEn, product.lineNameAr)}
          </p>
        )}
      </div>
      {sections
        .filter(([, text]) => text)
        .map(([title, text]) => (
          <section key={title} className="grid gap-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{text}</p>
          </section>
        ))}
    </div>
  )
}
