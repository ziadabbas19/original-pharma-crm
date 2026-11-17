import { keepPreviousData } from '@tanstack/react-query'
import {
  BuildingIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PillIcon,
  QrCodeIcon,
  StethoscopeIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCustomersList } from '@/api/generated/endpoints'
import type { CustomerDto, CustomerType, CustomersListParams } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatDistance, formatNumber, localizedName } from '@/lib/format'

const column = dataTableColumns<CustomerDto>()
/** Same cap as CustomerService.MaxRows in the API. */
const MAX_ROWS = 1000
type StatusFilter = 'all' | 'active' | 'inactive'

export function CustomersPage() {
  const { t } = useTranslation()
  const [type, setType] = useState<'' | CustomerType>('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim(), 350)

  const params = useMemo<CustomersListParams | undefined>(
    () => (type || term ? { ...(type ? { type } : {}), ...(term ? { search: term } : {}) } : undefined),
    [type, term],
  )
  const customers = useCustomersList(params, { query: { placeholderData: keepPreviousData } })

  const filtered = useMemo(
    () => customers.data?.filter((c) => status === 'all' || (status === 'active') === c.isActive),
    [customers.data, status],
  )

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((c) => localizedName(c.name, c.nameAr), {
          id: 'name',
          header: () => t('customers.name'),
          cell: ({ row }) => {
            const c = row.original
            const shown = localizedName(c.name, c.nameAr)
            const other = shown === c.name ? c.nameAr : c.name
            return (
              <div className="min-w-0">
                <div className="font-medium">{shown}</div>
                {other && <div className="text-xs text-muted-foreground">{other}</div>}
              </div>
            )
          },
        }),
        column.accessor('type', {
          header: () => t('customers.type'),
          cell: (info) =>
            info.getValue() === 'doctor' ? (
              <Badge variant="secondary">
                <StethoscopeIcon />
                {t('customers.types.doctor')}
              </Badge>
            ) : (
              <Badge variant="secondary">
                <PillIcon />
                {t('customers.types.pharmacy')}
              </Badge>
            ),
        }),
        column.accessor((c) => localizedName(c.territoryName, c.territoryNameAr), {
          id: 'territory',
          header: () => t('customers.territory'),
          cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
          meta: { className: 'hidden md:table-cell' },
        }),
        column.accessor('address', {
          header: () => t('customers.address'),
          enableSorting: false,
          cell: (info) => (
            <span className="block max-w-xs truncate" title={info.getValue() ?? undefined}>
              {info.getValue() || <span className="text-muted-foreground">—</span>}
            </span>
          ),
          meta: { className: 'hidden xl:table-cell' },
        }),
        column.display({
          id: 'location',
          header: () => t('customers.location'),
          cell: ({ row }) => {
            const { lat, lng, geofenceRadiusMeters } = row.original
            if (lat == null || lng == null)
              return <Badge variant="warning">{t('customers.noLocation')}</Badge>
            return (
              <a
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLinkIcon className="size-3.5" />
                {t('customers.geofence', { radius: formatDistance(geofenceRadiusMeters) })}
              </a>
            )
          },
        }),
        column.accessor('hasQrCode', {
          header: () => t('customers.qr'),
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="outline">
                <QrCodeIcon />
                {t('common.yes')}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { className: 'hidden lg:table-cell' },
        }),
        column.accessor('isActive', {
          header: () => t('customers.status'),
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="success">{t('users.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('users.inactive')}</Badge>
            ),
        }),
      ]),
    [t],
  )

  const isFiltered = search !== '' || type !== '' || status !== 'active'

  return (
    <>
      <PageHeader title={t('customers.title')} description={t('customers.hint')} />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={customers.isLoading}
        error={customers.error}
        onRetry={() => void customers.refetch()}
        getRowId={(c) => c.id}
        initialSorting={[{ id: 'name', desc: false }]}
        filtered={isFiltered}
        onClearFilters={() => {
          setSearch('')
          setType('')
          setStatus('active')
        }}
        empty={{ icon: BuildingIcon, title: t('customers.empty'), description: t('customers.emptyHint') }}
        footer={
          customers.data?.length === MAX_ROWS
            ? t('customers.capped', { count: MAX_ROWS, formatted: formatNumber(MAX_ROWS) })
            : undefined
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('customers.searchPlaceholder')} />
            <FilterField label={t('customers.type')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={type}
                  onChange={(e) => setType(e.target.value as '' | CustomerType)}
                >
                  <option value="">{t('table.all')}</option>
                  <option value="doctor">{t('customers.types.doctor')}</option>
                  <option value="pharmacy">{t('customers.types.pharmacy')}</option>
                </NativeSelect>
              )}
            </FilterField>
            <FilterField label={t('customers.status')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-32"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusFilter)}
                >
                  <option value="active">{t('users.active')}</option>
                  <option value="inactive">{t('users.inactive')}</option>
                  <option value="all">{t('table.all')}</option>
                </NativeSelect>
              )}
            </FilterField>
            <ToolbarSpacer />
            {customers.isFetching && !customers.isLoading && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            )}
          </>
        }
      />
    </>
  )
}
