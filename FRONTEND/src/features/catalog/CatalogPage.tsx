import { useQueryClient } from '@tanstack/react-query'
import { FolderInputIcon, LayersIcon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  productLinesBulkDelete,
  productsBulkDelete,
  productsBulkRestore,
  useProductLinesList,
  useProductsList,
} from '@/api/generated/endpoints'
import type { ProductDto, ProductLineDto } from '@/api/generated/model'
import { ArchivedBadge, ArchivedToggle, RestoreSelectedButton } from '@/components/bulk/ArchiveControls'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { ProductThumb } from '@/features/orders/ProductPicker'
import { formatMoney, formatNumber, formatPercent, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { MoveToLineDialog } from './MoveToLineDialog'
import { ProductDialog } from './ProductDialog'
import { ProductLineDialog } from './ProductLineDialog'

const productColumn = dataTableColumns<ProductDto>()
const lineColumn = dataTableColumns<ProductLineDto>()
/** Line filter value for products without a line. */
const UNASSIGNED = 'unassigned'
const NO_PRODUCTS: ProductDto[] = []

type Tab = 'products' | 'lines'

/** Products and product lines: names, price in EGP, stock, discounts, picture, line assignment. */
export function CatalogPage() {
  const { t } = useTranslation()
  const canManage = usePermission(P.products.manage)
  const [tab, setTab] = useState<Tab>('products')
  const [lineFilter, setLineFilter] = useState('')
  const lines = useProductLinesList({ includeInactive: canManage })
  const allProducts = useProductsList({ includeInactive: canManage })
  const unassignedCount = (allProducts.data ?? NO_PRODUCTS).filter((p) => !p.productLineId).length
  const [editingLine, setEditingLine] = useState<ProductLineDto | null | undefined>(undefined)
  const [editingProduct, setEditingProduct] = useState<ProductDto | null | undefined>(undefined)

  return (
    <>
      <PageHeader
        title={t('catalog.title')}
        description={t('catalog.hint')}
        actions={
          canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditingLine(null)}>
                <PlusIcon />
                {t('catalog.addLine')}
              </Button>
              <Button onClick={() => setEditingProduct(null)}>
                <PlusIcon />
                {t('catalog.addProduct')}
              </Button>
            </div>
          )
        }
      />
      <div
        className="mb-4 inline-flex rounded-md border bg-card p-0.5"
        role="tablist"
        aria-label={t('catalog.title')}
      >
        <TabButton
          active={tab === 'products'}
          onClick={() => setTab('products')}
          icon={<PackageIcon className="size-4" />}
        >
          {t('catalog.tabs.products')}
        </TabButton>
        <TabButton
          active={tab === 'lines'}
          onClick={() => setTab('lines')}
          icon={<LayersIcon className="size-4" />}
        >
          {t('catalog.tabs.lines')}
        </TabButton>
      </div>
      {tab === 'products' ? (
        <ProductsTable
          lines={lines.data ?? []}
          lineFilter={lineFilter}
          onLineFilterChange={setLineFilter}
          onEdit={setEditingProduct}
        />
      ) : (
        <LinesTable
          lines={lines}
          unassignedCount={unassignedCount}
          onEdit={setEditingLine}
          onShowUnassigned={() => {
            setLineFilter(UNASSIGNED)
            setTab('products')
          }}
        />
      )}
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
          defaultLineId={lineFilter && lineFilter !== UNASSIGNED ? lineFilter : undefined}
          onClose={() => setEditingProduct(undefined)}
        />
      )}
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-accent text-accent-foreground' : 'hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** "5% · max 15%": the effective default and limit (product first, else line). */
function DiscountCell({ product }: { product: ProductDto }) {
  const { t } = useTranslation()
  const def = product.effectiveDefaultDiscountPercent
  const max = product.effectiveMaxDiscountPercent
  if (def == null && max == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="text-xs tabular-nums">
      {def != null && formatPercent(def)}
      {def != null && max != null && ' · '}
      {max != null && t('catalog.maxShort', { value: formatPercent(max) })}
    </span>
  )
}

function ProductsTable({
  lines,
  lineFilter,
  onLineFilterChange,
  onEdit,
}: {
  lines: ProductLineDto[]
  lineFilter: string
  onLineFilterChange: (value: string) => void
  onEdit: (product: ProductDto) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canManage = usePermission(P.products.manage)
  const canDelete = usePermission(P.products.delete)
  const canRestore = usePermission(P.products.restore)
  // Unassigned products are visible to catalog and order managers only.
  const canManageOrders = usePermission(P.orders.manage)
  const seesUnassigned = canManage || canManageOrders
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [moving, setMoving] = useState(false)
  const products = useProductsList({ includeInactive: canManage, archived })
  const target = useDeleteTarget()

  const filtered = useMemo(() => {
    if (!products.data) return undefined
    const q = search.trim().toLowerCase()
    return products.data.filter(
      (p) =>
        (!lineFilter || (lineFilter === UNASSIGNED ? !p.productLineId : p.productLineId === lineFilter)) &&
        (!q || p.nameEn.toLowerCase().includes(q) || p.nameAr.includes(q)),
    )
  }, [products.data, lineFilter, search])
  const selection = useSelection(filtered, productId)
  const bulk = useBulkRunner(productsBulkDelete, ['/api/products', '/api/product-lines'], selection)
  const nameOf = (id: string) => {
    const p = products.data?.find((x) => x.id === id)
    return p ? localizedName(p.nameEn, p.nameAr) : id
  }

  const columns = useMemo(
    () =>
      productColumn.columns([
        productColumn.accessor((p) => localizedName(p.nameEn, p.nameAr), {
          id: 'name',
          header: () => t('catalog.product'),
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <ProductThumb url={row.original.thumbnailUrl} className="size-10" />
              <div className="min-w-0">
                <div className="font-medium">{localizedName(row.original.nameEn, row.original.nameAr)}</div>
                <div className="text-xs text-muted-foreground">
                  {row.original.productLineId ? (
                    localizedName(row.original.lineNameEn, row.original.lineNameAr)
                  ) : (
                    <Badge variant="warning" className="text-[11px]">
                      {t('catalog.unassigned')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ),
        }),
        productColumn.accessor('price', {
          header: () => t('catalog.price'),
          cell: (info) => <span className="tabular-nums">{formatMoney(info.getValue())}</span>,
          meta: { className: 'hidden @[35rem]:table-cell' },
        }),
        productColumn.accessor('stockQuantity', {
          header: () => t('catalog.stock'),
          cell: (info) => (
            <span className={cn('tabular-nums', info.getValue() <= 10 && 'font-medium text-warning')}>
              {formatNumber(info.getValue())}
            </span>
          ),
          meta: { className: 'hidden @[40rem]:table-cell' },
        }),
        productColumn.accessor((p) => p.effectiveMaxDiscountPercent ?? -1, {
          id: 'discount',
          header: () => t('catalog.discount'),
          cell: ({ row }) => <DiscountCell product={row.original} />,
          meta: { className: 'hidden @[52rem]:table-cell' },
        }),
        productColumn.accessor('isActive', {
          header: () => t('users.status'),
          cell: ({ row }) =>
            row.original.archivedAt ? (
              <ArchivedBadge />
            ) : row.original.isActive ? (
              <Badge variant="success">{t('catalog.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('catalog.inactive')}</Badge>
            ),
          meta: { className: 'hidden @[44rem]:table-cell' },
        }),
        ...((canManage || canDelete) && !archived
          ? [
              productColumn.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end gap-1">
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={t('catalog.editProduct')}
                        title={t('catalog.editProduct')}
                        onClick={() => onEdit(row.original)}
                      >
                        <PencilIcon />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                        onClick={() => target.open([row.original.id])}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    [t, canManage, canDelete, archived, onEdit, target],
  )

  const selectable = archived ? canRestore : canManage || canDelete

  return (
    <>
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={products.isLoading}
        error={products.error}
        onRetry={() => void products.refetch()}
        getRowId={productId}
        initialSorting={[{ id: 'name', desc: false }]}
        filtered={search !== '' || lineFilter !== ''}
        onClearFilters={() => {
          setSearch('')
          onLineFilterChange('')
        }}
        empty={{ icon: PackageIcon, title: archived ? t('archive.empty') : t('catalog.empty') }}
        selection={selectable ? selection : undefined}
        rowLabel={(p) => localizedName(p.nameEn, p.nameAr)}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => productsBulkRestore({ ids })}
              onDone={() => void queryClient.invalidateQueries({ queryKey: ['/api/products'] })}
            />
          ) : (
            <>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setMoving(true)}>
                  <FolderInputIcon />
                  {t('catalog.moveToLine')}
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
                  <Trash2Icon />
                  {t('bulk.deleteSelected')}
                </Button>
              )}
            </>
          )
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('catalog.searchPlaceholder')} />
            <FilterField label={t('catalog.line')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-44"
                  value={lineFilter}
                  onChange={(e) => onLineFilterChange(e.target.value)}
                >
                  <option value="">{t('catalog.allLines')}</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {localizedName(l.nameEn, l.nameAr)}
                    </option>
                  ))}
                  {seesUnassigned && <option value={UNASSIGNED}>{t('catalog.unassigned')}</option>}
                </NativeSelect>
              )}
            </FilterField>
            <ToolbarSpacer />
            {(canDelete || canRestore) && (
              <ArchivedToggle
                archived={archived}
                onChange={(value) => {
                  selection.clear()
                  setArchived(value)
                }}
              />
            )}
          </>
        }
      />
      {moving && (
        <MoveToLineDialog
          productIds={selection.ids}
          lines={lines}
          nameOf={nameOf}
          onDone={(blocked) => selection.keep(blocked)}
          onClose={() => setMoving(false)}
        />
      )}
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          consequence={t('catalog.deleteProductConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
    </>
  )
}

function LinesTable({
  lines,
  unassignedCount,
  onEdit,
  onShowUnassigned,
}: {
  lines: { data?: ProductLineDto[]; isLoading: boolean; error: unknown; refetch: () => unknown }
  unassignedCount: number
  onEdit: (line: ProductLineDto) => void
  onShowUnassigned: () => void
}) {
  const { t } = useTranslation()
  const canManage = usePermission(P.products.manage)
  const canDelete = usePermission(P.products.delete)
  const [search, setSearch] = useState('')
  const target = useDeleteTarget()
  const filtered = useMemo(() => {
    if (!lines.data) return undefined
    const q = search.trim().toLowerCase()
    return q
      ? lines.data.filter((l) => l.nameEn.toLowerCase().includes(q) || l.nameAr.includes(q))
      : lines.data
  }, [lines.data, search])
  const selection = useSelection(filtered, lineId)
  const bulk = useBulkRunner(
    productLinesBulkDelete,
    ['/api/product-lines', '/api/products', '/api/users'],
    selection,
  )
  const nameOf = (id: string) => {
    const l = lines.data?.find((x) => x.id === id)
    return l ? localizedName(l.nameEn, l.nameAr) : id
  }

  const columns = useMemo(
    () =>
      lineColumn.columns([
        lineColumn.accessor((l) => localizedName(l.nameEn, l.nameAr), {
          id: 'name',
          header: () => t('catalog.line'),
          cell: ({ row }) => (
            <div className="min-w-0">
              <div
                className={cn('font-medium', !row.original.isActive && 'text-muted-foreground line-through')}
              >
                {localizedName(row.original.nameEn, row.original.nameAr)}
              </div>
              {row.original.description && (
                <div className="max-w-sm truncate text-xs text-muted-foreground">
                  {row.original.description}
                </div>
              )}
            </div>
          ),
        }),
        lineColumn.accessor('productCount', {
          header: () => t('catalog.products'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          meta: { className: 'hidden @[32rem]:table-cell' },
        }),
        lineColumn.accessor((l) => l.repCount ?? 0, {
          id: 'reps',
          header: () => t('catalog.reps'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          meta: { className: 'hidden @[44rem]:table-cell' },
        }),
        lineColumn.accessor((l) => l.defaultDiscountPercent ?? -1, {
          id: 'default',
          header: () => t('catalog.defaultDiscount'),
          cell: ({ row }) =>
            row.original.defaultDiscountPercent != null ? (
              <span className="tabular-nums">{formatPercent(row.original.defaultDiscountPercent)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { className: 'hidden @[66rem]:table-cell' },
        }),
        lineColumn.accessor((l) => l.maxDiscountPercent ?? -1, {
          id: 'max',
          header: () => t('catalog.maxDiscount'),
          cell: ({ row }) =>
            row.original.maxDiscountPercent != null ? (
              <span className="tabular-nums">{formatPercent(row.original.maxDiscountPercent)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { className: 'hidden @[55rem]:table-cell' },
        }),
        lineColumn.accessor('isActive', {
          header: () => t('users.status'),
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="success">{t('catalog.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('catalog.inactive')}</Badge>
            ),
          meta: { className: 'hidden @[38rem]:table-cell' },
        }),
        ...(canManage || canDelete
          ? [
              lineColumn.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end gap-1">
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={t('catalog.editLine')}
                        title={t('catalog.editLine')}
                        onClick={() => onEdit(row.original)}
                      >
                        <PencilIcon />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                        onClick={() => target.open([row.original.id])}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    [t, canManage, canDelete, onEdit, target],
  )

  return (
    <div className="grid gap-3">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <span>
            {t('catalog.unassignedCount', { count: unassignedCount, value: formatNumber(unassignedCount) })}
          </span>
          {unassignedCount > 0 && (
            <Button size="sm" variant="outline" onClick={onShowUnassigned}>
              {t('catalog.showUnassigned')}
            </Button>
          )}
        </div>
      )}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={lines.isLoading}
        error={lines.error}
        onRetry={() => void lines.refetch()}
        getRowId={lineId}
        initialSorting={[{ id: 'name', desc: false }]}
        filtered={search !== ''}
        onClearFilters={() => setSearch('')}
        empty={{ icon: LayersIcon, title: t('catalog.noLines') }}
        selection={canDelete ? selection : undefined}
        rowLabel={(l) => localizedName(l.nameEn, l.nameAr)}
        bulkActions={
          <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
            <Trash2Icon />
            {t('bulk.deleteSelected')}
          </Button>
        }
        toolbar={<SearchInput value={search} onChange={setSearch} />}
      />
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          consequence={t('catalog.deleteLineConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
    </div>
  )
}

const productId = (p: ProductDto) => p.id
const lineId = (l: ProductLineDto) => l.id
