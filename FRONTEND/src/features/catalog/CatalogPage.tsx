import { PackageIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProductLinesList, useProductsList } from '@/api/generated/endpoints'
import type { ProductDto, ProductLineDto } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { ProductThumb } from '@/features/orders/ProductPicker'
import { formatMoney, formatNumber, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ProductDialog } from './ProductDialog'
import { ProductLineDialog } from './ProductLineDialog'

const column = dataTableColumns<ProductDto>()

/** Product lines (left) and their products (right): names, price in EGP, stock, picture. */
export function CatalogPage() {
  const { t } = useTranslation()
  const canManage = usePermission(P.products.manage)
  const lines = useProductLinesList({ includeInactive: canManage })
  const products = useProductsList({ includeInactive: canManage })
  const [lineId, setLineId] = useState('')
  const [search, setSearch] = useState('')
  const [editingLine, setEditingLine] = useState<ProductLineDto | null | undefined>(undefined)
  const [editingProduct, setEditingProduct] = useState<ProductDto | null | undefined>(undefined)

  const filtered = useMemo(() => {
    if (!products.data) return undefined
    const q = search.trim().toLowerCase()
    return products.data.filter(
      (p) =>
        (!lineId || p.productLineId === lineId) &&
        (!q || p.nameEn.toLowerCase().includes(q) || p.nameAr.includes(q)),
    )
  }, [products.data, lineId, search])

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((p) => localizedName(p.nameEn, p.nameAr), {
          id: 'name',
          header: () => t('catalog.product'),
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <ProductThumb url={row.original.thumbnailUrl} className="size-10" />
              <div className="min-w-0">
                <div className="font-medium">{localizedName(row.original.nameEn, row.original.nameAr)}</div>
                <div className="text-xs text-muted-foreground">
                  {localizedName(row.original.lineNameEn, row.original.lineNameAr)}
                </div>
              </div>
            </div>
          ),
        }),
        column.accessor('price', {
          header: () => t('catalog.price'),
          cell: (info) => <span className="tabular-nums">{formatMoney(info.getValue())}</span>,
        }),
        column.accessor('stockQuantity', {
          header: () => t('catalog.stock'),
          cell: (info) => (
            <span className={cn('tabular-nums', info.getValue() <= 10 && 'font-medium text-warning')}>
              {formatNumber(info.getValue())}
            </span>
          ),
        }),
        column.accessor('isActive', {
          header: () => t('users.status'),
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="success">{t('catalog.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('catalog.inactive')}</Badge>
            ),
          meta: { className: 'hidden md:table-cell' },
        }),
        ...(canManage
          ? [
              column.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('catalog.editProduct')}
                      onClick={() => setEditingProduct(row.original)}
                    >
                      <PencilIcon />
                    </Button>
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    [t, canManage],
  )

  return (
    <>
      <PageHeader
        title={t('catalog.title')}
        description={t('catalog.hint')}
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingLine(null)}>
                <PlusIcon />
                {t('catalog.addLine')}
              </Button>
              <Button onClick={() => setEditingProduct(null)} disabled={!lines.data?.length}>
                <PlusIcon />
                {t('catalog.addProduct')}
              </Button>
            </div>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit gap-0 py-2">
          {lines.isLoading ? (
            <LoadingState rows={3} className="p-2" />
          ) : lines.error ? (
            <ErrorState error={lines.error} onRetry={() => void lines.refetch()} className="mx-2" />
          ) : (
            <ul className="grid gap-0.5 px-2" aria-label={t('catalog.lines')}>
              <LineItem
                label={t('catalog.allLines')}
                count={products.data?.length ?? 0}
                selected={lineId === ''}
                onSelect={() => setLineId('')}
              />
              {(lines.data ?? []).map((l) => (
                <LineItem
                  key={l.id}
                  label={localizedName(l.nameEn, l.nameAr)}
                  count={l.productCount}
                  inactive={!l.isActive}
                  selected={lineId === l.id}
                  onSelect={() => setLineId(l.id)}
                  onEdit={canManage ? () => setEditingLine(l) : undefined}
                />
              ))}
            </ul>
          )}
        </Card>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={products.isLoading}
          error={products.error}
          onRetry={() => void products.refetch()}
          getRowId={(p) => p.id}
          initialSorting={[{ id: 'name', desc: false }]}
          filtered={search !== '' || lineId !== ''}
          onClearFilters={() => {
            setSearch('')
            setLineId('')
          }}
          empty={{ icon: PackageIcon, title: t('catalog.empty') }}
          toolbar={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder={t('catalog.searchPlaceholder')} />
              <ToolbarSpacer />
            </>
          }
        />
      </div>
      {editingLine !== undefined && (
        <ProductLineDialog
          key={editingLine?.id ?? 'new'}
          line={editingLine}
          onClose={() => setEditingLine(undefined)}
        />
      )}
      {editingProduct !== undefined && (
        <ProductDialog
          key={editingProduct?.id ?? 'new'}
          product={editingProduct}
          lines={lines.data ?? []}
          defaultLineId={lineId || undefined}
          onClose={() => setEditingProduct(undefined)}
        />
      )}
    </>
  )
}

function LineItem({
  label,
  count,
  selected,
  inactive,
  onSelect,
  onEdit,
}: {
  label: string
  count: number
  selected: boolean
  inactive?: boolean
  onSelect: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-accent',
          selected && 'bg-accent font-medium',
        )}
      >
        <span className={cn('flex-1 truncate', inactive && 'text-muted-foreground line-through')}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(count)}</span>
      </button>
      {onEdit && (
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={t('catalog.editLine')}
          onClick={onEdit}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      )}
    </li>
  )
}
