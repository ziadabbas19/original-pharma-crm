import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { ClipboardListIcon, DownloadIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getOrdersExportUrl,
  ordersBulkDelete,
  ordersBulkRestore,
  useLookupsListCollectionMethods,
  useLookupsListTowns,
  useOrdersList,
  useUsersList,
} from '@/api/generated/endpoints'
import type {
  DeliveryStatus,
  OrderListItemDto,
  OrdersListParams,
  OrderStatus,
  PlaceType,
} from '@/api/generated/model'
import { ArchivedBadge, ArchivedToggle, RestoreSelectedButton } from '@/components/bulk/ArchiveControls'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { apiFetch } from '@/lib/api-client'
import { handleError } from '@/lib/errors'
import { exportCsv } from '@/lib/export-file'
import { formatDay, formatMoney, formatNumber, localizedName, toDateInputValue } from '@/lib/format'
import { P } from '@/lib/permissions'
import { DELIVERY_STATUSES, OTHER_METHOD, ORDER_STATUSES, PLACE_TYPES } from './order-labels'
import { OrderReviewSheet } from './OrderReviewSheet'
import { DeliveryBadge, OrderStatusBadge } from './OrderStatusBadge'

const route = getRouteApi('/admin/orders')
const column = dataTableColumns<OrderListItemDto>()
const orderId = (o: OrderListItemDto) => o.id

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toDateInputValue(date)
}

/** Dashboard order list: filters, detail with approve / reject / cancel, CSV export. */
export function OrdersPage() {
  const { t, i18n } = useTranslation()
  const canReadUsers = usePermission(P.users.read)
  const canDelete = usePermission(P.orders.delete)
  const canRestore = usePermission(P.orders.restore)
  const queryClient = useQueryClient()
  const [archived, setArchived] = useState(false)
  const [delivery, setDelivery] = useState<'' | NonNullable<DeliveryStatus>>('')
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(toDateInputValue(new Date()))
  const [repId, setRepId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [status, setStatus] = useState<'' | OrderStatus>('')
  const [placeType, setPlaceType] = useState<'' | PlaceType>('')
  const [place, setPlace] = useState('')
  const [method, setMethod] = useState('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(route.useSearch().order ?? null)
  const [exporting, setExporting] = useState(false)
  const debouncedPlace = useDebouncedValue(place.trim(), 300)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const params: OrdersListParams = {
    From: from || undefined,
    To: to || undefined,
    RepId: repId || undefined,
    AreaId: areaId || undefined,
    Status: status || undefined,
    PlaceType: placeType || undefined,
    Place: debouncedPlace || undefined,
    CollectionMethodId: method && method !== OTHER_METHOD ? method : undefined,
    Search: debouncedSearch || undefined,
    Delivery: delivery || undefined,
    Archived: archived || undefined,
  }
  const orders = useOrdersList(params, { query: { placeholderData: keepPreviousData } })
  const users = useUsersList(undefined, { query: { enabled: canReadUsers } })
  const towns = useLookupsListTowns()
  const methods = useLookupsListCollectionMethods({ includeInactive: true })

  const rows = useMemo(
    () => (method === OTHER_METHOD ? orders.data?.filter((o) => !o.collectionMethodId) : orders.data),
    [orders.data, method],
  )
  const selection = useSelection(rows, orderId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(ordersBulkDelete, ['/api/orders', '/api/stats'], selection)
  const nameOf = (id: string) => orders.data?.find((o) => o.id === id)?.number ?? id

  const areas = useMemo(() => {
    const byId = new Map<string, string>()
    for (const town of towns.data ?? [])
      if (town.areaId) byId.set(town.areaId, localizedName(town.areaName, town.areaNameAr))
    return [...byId.entries()]
  }, [towns.data])
  const reps = useMemo(() => {
    if (users.data) return users.data.map((u) => [u.id, u.fullName] as const)
    const seen = new Map<string, string>()
    for (const o of orders.data ?? []) seen.set(o.userId, o.repName)
    return [...seen.entries()]
  }, [users.data, orders.data])

  const total = useMemo(
    () =>
      (rows ?? []).reduce(
        (sum, o) => sum + (o.status === 'cancelled' || o.status === 'rejected' ? 0 : o.total),
        0,
      ),
    [rows],
  )

  const exportOrders = async () => {
    setExporting(true)
    try {
      const text = await apiFetch<string>(
        getOrdersExportUrl({ ...params, lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar' }),
        {
          headers: { Accept: 'text/csv' },
        },
      )
      await exportCsv(`orders-${from || 'all'}-${to || 'today'}.csv`, text)
    } catch (e) {
      handleError(e, { context: 'orders.export' })
    } finally {
      setExporting(false)
    }
  }

  const isFiltered =
    repId !== '' ||
    areaId !== '' ||
    status !== '' ||
    delivery !== '' ||
    placeType !== '' ||
    place !== '' ||
    method !== '' ||
    search !== ''
  const clear = () => {
    setRepId('')
    setAreaId('')
    setStatus('')
    setDelivery('')
    setPlaceType('')
    setPlace('')
    setMethod('')
    setSearch('')
  }

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('number', {
          header: () => t('orders.number'),
          cell: (info) => (
            <span dir="ltr" className="font-mono text-xs">
              {info.getValue()}
            </span>
          ),
        }),
        column.accessor('orderDate', {
          header: () => t('orders.date'),
          cell: (info) => formatDay(info.getValue()),
          meta: { className: 'hidden @[44rem]:table-cell' },
        }),
        column.accessor('repName', {
          header: () => t('orders.rep'),
          cell: ({ row }) => (
            <div>
              <div className="font-medium">{row.original.repName}</div>
              <div className="text-xs text-muted-foreground">
                {localizedName(row.original.territoryName, row.original.territoryNameAr)}
              </div>
            </div>
          ),
          meta: { className: 'hidden @[40rem]:table-cell' },
        }),
        column.accessor('placeName', {
          header: () => t('orders.place'),
          cell: ({ row }) => (
            <div>
              <div>{row.original.placeName}</div>
              <div className="text-xs text-muted-foreground">
                {t(`orders.placeTypes.${row.original.placeType}`)}
              </div>
            </div>
          ),
          meta: { className: 'hidden @[60rem]:table-cell' },
        }),
        column.accessor(
          (o) =>
            o.collectionMethodId
              ? localizedName(o.collectionMethodNameEn, o.collectionMethodNameAr)
              : (o.collectionMethodOther ?? ''),
          {
            id: 'method',
            header: () => t('orders.collectionMethod'),
            meta: { className: 'hidden @[76rem]:table-cell' },
          },
        ),
        column.accessor('status', {
          header: () => t('orders.status'),
          cell: ({ row }) => (
            <div className="flex flex-wrap gap-1">
              {row.original.archivedAt ? (
                <ArchivedBadge />
              ) : (
                <OrderStatusBadge status={row.original.status} />
              )}
              <DeliveryBadge delivery={row.original.delivery} />
            </div>
          ),
        }),
        column.accessor((o) => o.discountTotal ?? 0, {
          id: 'discount',
          header: () => <span className="block text-end">{t('orders.discount')}</span>,
          cell: (info) => (
            <span className="block text-end text-muted-foreground tabular-nums">
              {info.getValue() > 0 ? formatMoney(info.getValue()) : '—'}
            </span>
          ),
          meta: { className: 'hidden @[69rem]:table-cell' },
        }),
        column.accessor('total', {
          header: () => <span className="block text-end">{t('orders.total')}</span>,
          cell: (info) => (
            <span className="block text-end font-medium tabular-nums">{formatMoney(info.getValue())}</span>
          ),
        }),
      ]),
    [t],
  )

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        description={t('orders.hint')}
        actions={
          <Button variant="outline" onClick={() => void exportOrders()} disabled={exporting || !rows?.length}>
            {exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
            {t('orders.export')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={orders.isLoading}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        getRowId={(o) => o.id}
        filtered={isFiltered}
        onClearFilters={clear}
        empty={
          archived
            ? { icon: ClipboardListIcon, title: t('archive.empty') }
            : { icon: ClipboardListIcon, title: t('orders.empty'), description: t('orders.emptyHint') }
        }
        selection={(archived ? canRestore : canDelete) ? selection : undefined}
        rowLabel={(o) => o.number}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => ordersBulkRestore({ ids })}
              onDone={() => void queryClient.invalidateQueries({ queryKey: ['/api/orders'] })}
            />
          ) : (
            <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
              <Trash2Icon />
              {t('bulk.deleteSelected')}
            </Button>
          )
        }
        footer={
          rows && (
            <span>
              {t('orders.summary', {
                count: rows.length,
                value: formatNumber(rows.length),
                total: formatMoney(total),
              })}
              {rows.length >= 1000 && ` · ${t('orders.capped')}`}
            </span>
          )
        }
        onRowClick={(o) => setOpenId(o.id)}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('orders.searchPlaceholder')} />
            <FilterField
              label={t('visits.from')}
              active={from !== daysAgo(30)}
              display={from ? `${t('visits.from')} ${formatDay(from)}` : t('visits.from')}
              onReset={() => setFrom(daysAgo(30))}
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  dir="ltr"
                  className="h-9 w-40"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              )}
            </FilterField>
            <FilterField
              label={t('visits.to')}
              active={to !== toDateInputValue(new Date())}
              display={to ? `${t('visits.to')} ${formatDay(to)}` : t('visits.to')}
              onReset={() => setTo(toDateInputValue(new Date()))}
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  dir="ltr"
                  className="h-9 w-40"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              )}
            </FilterField>
            <FilterField
              label={t('orders.rep')}
              active={repId !== ''}
              display={reps.find(([id]) => id === repId)?.[1]}
              onReset={() => setRepId('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-44"
                  value={repId}
                  onChange={(e) => setRepId(e.target.value)}
                >
                  <option value="">{t('table.all')}</option>
                  {reps.map(([id2, name]) => (
                    <option key={id2} value={id2}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('doctors.area')}
              active={areaId !== ''}
              display={areas.find(([id]) => id === areaId)?.[1]}
              onReset={() => setAreaId('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-40"
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                >
                  <option value="">{t('table.all')}</option>
                  {areas.map(([id2, name]) => (
                    <option key={id2} value={id2}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('orders.status')}
              active={status !== ''}
              display={status ? t(`orders.statuses.${status}`) : undefined}
              onReset={() => setStatus('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as '' | OrderStatus)}
                >
                  <option value="">{t('table.all')}</option>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`orders.statuses.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('orders.deliveryLabel')}
              active={delivery !== ''}
              display={delivery ? t(`orders.delivery.${delivery}`) : undefined}
              onReset={() => setDelivery('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value as '' | NonNullable<DeliveryStatus>)}
                >
                  <option value="">{t('table.all')}</option>
                  {DELIVERY_STATUSES.map((d) => (
                    <option key={d} value={d}>
                      {t(`orders.delivery.${d}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('orders.placeType')}
              active={placeType !== ''}
              display={placeType ? t(`orders.placeTypes.${placeType}`) : undefined}
              onReset={() => setPlaceType('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={placeType}
                  onChange={(e) => setPlaceType(e.target.value as '' | PlaceType)}
                >
                  <option value="">{t('table.all')}</option>
                  {PLACE_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {t(`orders.placeTypes.${p}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('orders.place')}
              active={place.trim() !== ''}
              display={place.trim()}
              onReset={() => setPlace('')}
            >
              {(id) => (
                <Input
                  id={id}
                  className="h-9 w-40"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                />
              )}
            </FilterField>
            <FilterField
              label={t('orders.collectionMethod')}
              active={method !== ''}
              display={(() => {
                if (method === OTHER_METHOD) return t('orders.form.otherMethod')
                const m = (methods.data ?? []).find((x) => x.id === method)
                return m ? localizedName(m.nameEn, m.nameAr) : undefined
              })()}
              onReset={() => setMethod('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-40"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="">{t('table.all')}</option>
                  {(methods.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {localizedName(m.nameEn, m.nameAr)}
                    </option>
                  ))}
                  <option value={OTHER_METHOD}>{t('orders.form.otherMethod')}</option>
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
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          consequence={t('orders.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
      {openId && <OrderReviewSheet key={openId} orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
