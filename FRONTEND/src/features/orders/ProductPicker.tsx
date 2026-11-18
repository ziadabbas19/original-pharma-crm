import { PackageIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductDto, ProductLineDto } from '@/api/generated/model'
import { EmptyState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiAssetUrl } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { productName } from './order-labels'

export function ProductThumb({ url, className }: { url?: string | null; className?: string }) {
  const src = apiAssetUrl(url)
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <PackageIcon className="size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  )
}

/** Bottom sheet to browse lines and products (thumbnails, search) and add them to the order. */
export function ProductPicker({
  open,
  onOpenChange,
  products,
  lines,
  quantities,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: ProductDto[]
  lines: ProductLineDto[]
  /** productId -> quantity already in the order */
  quantities: Record<string, number>
  onAdd: (product: ProductDto) => void
}) {
  const { t, i18n } = useTranslation()
  const [lineId, setLineId] = useState('')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        (!lineId || p.productLineId === lineId) &&
        (!q || p.nameEn.toLowerCase().includes(q) || p.nameAr.includes(q)),
    )
  }, [products, lineId, search])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('orders.form.addProducts')}</SheetTitle>
          <SheetDescription>{t('orders.form.pickerHint')}</SheetDescription>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('orders.form.searchProducts')}
              className="ps-9"
              aria-label={t('orders.form.searchProducts')}
            />
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pt-2 pb-1">
            {[
              { id: '', label: t('table.all') },
              ...lines.map((l) => ({ id: l.id, label: productName(l, i18n.resolvedLanguage) })),
            ].map((chip) => (
              <button
                key={chip.id || 'all'}
                type="button"
                onClick={() => setLineId(chip.id)}
                className={cn(
                  'min-h-11 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap transition-colors',
                  lineId === chip.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
                aria-pressed={lineId === chip.id}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
          {visible.length === 0 ? (
            <EmptyState icon={PackageIcon} title={t('orders.form.noProducts')} />
          ) : (
            <ul className="grid gap-1">
              {visible.map((p) => {
                const inOrder = quantities[p.id] ?? 0
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onAdd(p)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-start hover:bg-accent active:bg-accent"
                    >
                      <ProductThumb url={p.thumbnailUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {productName(p, i18n.resolvedLanguage)}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                          <span className="tabular-nums">{formatMoney(p.price)}</span>
                          <span className={cn('tabular-nums', p.stockQuantity <= 0 && 'text-warning')}>
                            {t('orders.form.stock', {
                              count: p.stockQuantity,
                              value: formatNumber(p.stockQuantity),
                            })}
                          </span>
                        </span>
                      </span>
                      {inOrder > 0 && <Badge variant="success">×{formatNumber(inOrder)}</Badge>}
                      <PlusIcon className="size-5 text-primary" aria-hidden />
                      <span className="sr-only">{t('orders.form.add')}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
