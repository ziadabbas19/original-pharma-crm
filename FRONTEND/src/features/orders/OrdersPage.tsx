import { keepPreviousData } from '@tanstack/react-query'
import { ClipboardListIcon, DownloadIcon, Loader2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getOrdersExportUrl,
  useLookupsListCollectionMethods,
  useLookupsListTowns,
  useOrdersList,
  useUsersList,
} from '@/api/generated/endpoints'
import type { OrderListItemDto, OrdersListParams, OrderStatus, PlaceType } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { apiFetch } from '@/lib/api-client'
import { formatDay, formatMoney, formatNumber, localizedName, toDateInputValue } from '@/lib/format'
import { P } from '@/lib/permissions'
import { OTHER_METHOD, ORDER_STATUSES, PLACE_TYPES } from './order-labels'
import { OrderReviewSheet } from './OrderReviewSheet'
import { OrderStatusBadge } from './OrderStatusBadge'

const column = dataTableColumns<OrderListItemDto>()

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toDateInputValue(date)
}

/** Dashboard order list: filters, detail with approve / reject / cancel, CSV export. */
export function OrdersPage() {
  const { t, i18n } = useTranslation()
  const canReadUsers = usePermission(P.users.read)
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(toDateInputValue(new Date()))
  const [repId, setRepId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [status, setStatus] = useState<'' | OrderStatus>('')
  const [placeType, setPlaceType] = useState<'' | PlaceType>('')
  const [place, setPlace] = useState('')
  const [method, setMethod] = useState('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
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
  }
  const orders = useOrdersList(params, { query: { placeholderData: keepPreviousData } })
  const users = useUsersList({ query: { enabled: canReadUsers } })
  const towns = useLookupsListTowns()
  const methods = useLookupsListCollectionMethods({ includeInactive: true })

  const rows = useMemo(
    () => (method === OTHER_METHOD ? orders.data?.filter((o) => !o.collectionMethodId) : orders.data),
    [orders.data, method],
  )
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

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const text = await apiFetch<string>(
        getOrdersExportUrl({ ...params, lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar' }),
        {
          headers: { Accept: 'text/csv' },
        },
      )
      // Excel needs the byte order mark to read Arabic as UTF-8.
      const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `orders-${from || 'all'}-${to || 'today'}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch (e) {
      setExportError(e)
    } finally {
      setExporting(false)
    }
  }

  const isFiltered =
    repId !== '' ||
    areaId !== '' ||
    status !== '' ||
    placeType !== '' ||
    place !== '' ||
    method !== '' ||
    search !== ''
  const clear = () => {
    setRepId('')
    setAreaId('')
    setStatus('')
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
          meta: { className: 'hidden md:table-cell' },
        }),
        column.accessor(
          (o) =>
            o.collectionMethodId
              ? localizedName(o.collectionMethodNameEn, o.collectionMethodNameAr)
              : (o.collectionMethodOther ?? ''),
          {
            id: 'method',
            header: () => t('orders.collectionMethod'),
            meta: { className: 'hidden xl:table-cell' },
          },
        ),
        column.accessor('status', {
          header: () => t('orders.status'),
          cell: (info) => <OrderStatusBadge status={info.getValue()} />,
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
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || !rows?.length}>
            {exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
            {t('orders.export')}
          </Button>
        }
      />
      <FormError error={exportError} />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={orders.isLoading}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        getRowId={(o) => o.id}
        filtered={isFiltered}
        onClearFilters={clear}
        empty={{ icon: ClipboardListIcon, title: t('orders.empty'), description: t('orders.emptyHint') }}
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
            <FilterField label={t('visits.from')}>
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
            <FilterField label={t('visits.to')}>
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
            <FilterField label={t('orders.rep')}>
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
            <FilterField label={t('doctors.area')}>
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
            <FilterField label={t('orders.status')}>
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
            <FilterField label={t('orders.placeType')}>
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
            <FilterField label={t('orders.place')}>
              {(id) => (
                <Input
                  id={id}
                  className="h-9 w-40"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                />
              )}
            </FilterField>
            <FilterField label={t('orders.collectionMethod')}>
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
          </>
        }
      />
      {openId && <OrderReviewSheet key={openId} orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
