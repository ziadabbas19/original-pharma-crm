import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import {
  BuildingIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PencilIcon,
  PillIcon,
  QrCodeIcon,
  StethoscopeIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  customersBulkDelete,
  customersBulkRestore,
  doctorsGet,
  useCustomersList,
} from '@/api/generated/endpoints'
import type { CustomerDto, CustomerType, CustomersListParams, DoctorDto } from '@/api/generated/model'
import { ArchivedBadge, ArchivedToggle, RestoreSelectedButton } from '@/components/bulk/ArchiveControls'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { FormError } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { DoctorEditDialog } from '@/features/doctors/DoctorEditDialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatDistance, formatNumber, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { PharmacyEditDialog } from './PharmacyEditDialog'

const column = dataTableColumns<CustomerDto>()
/** Same cap as CustomerService.MaxRows in the API. */
const MAX_ROWS = 1000
type StatusFilter = 'all' | 'active' | 'inactive'
const customerId = (c: CustomerDto) => c.id

export function CustomersPage() {
  const { t } = useTranslation()
  const [type, setType] = useState<'' | CustomerType>('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [editingPharmacy, setEditingPharmacy] = useState<CustomerDto | null>(null)
  const [editingDoctor, setEditingDoctor] = useState<DoctorDto | null>(null)
  const [editError, setEditError] = useState<unknown>(null)
  const term = useDebouncedValue(search.trim(), 350)
  const queryClient = useQueryClient()
  const canEdit = usePermission(P.customers.manage)
  const canDelete = usePermission(P.customers.delete)
  const canRestore = usePermission(P.customers.restore)

  const params = useMemo<CustomersListParams>(
    () => ({ ...(type ? { type } : {}), ...(term ? { search: term } : {}), archived }),
    [type, term, archived],
  )
  const customers = useCustomersList(params, { query: { placeholderData: keepPreviousData } })

  const filtered = useMemo(
    () => customers.data?.filter((c) => archived || status === 'all' || (status === 'active') === c.isActive),
    [customers.data, status, archived],
  )
  const selection = useSelection(filtered, customerId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(customersBulkDelete, ['/api/customers', '/api/doctors'], selection)
  const nameOf = (id: string) => {
    const c = customers.data?.find((x) => x.id === id)
    return c ? localizedName(c.name, c.nameAr) : id
  }

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
          meta: { className: 'hidden @[32rem]:table-cell' },
        }),
        column.accessor((c) => localizedName(c.territoryName, c.territoryNameAr), {
          id: 'territory',
          header: () => t('customers.territory'),
          cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
          meta: { className: 'hidden @[50rem]:table-cell' },
        }),
        column.accessor('address', {
          header: () => t('customers.address'),
          enableSorting: false,
          cell: (info) => (
            <span className="block max-w-xs truncate" title={info.getValue() ?? undefined}>
              {info.getValue() || <span className="text-muted-foreground">—</span>}
            </span>
          ),
          meta: { className: 'hidden @[74rem]:table-cell' },
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
          meta: { className: 'hidden @[43rem]:table-cell' },
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
          meta: { className: 'hidden @[55rem]:table-cell' },
        }),
        column.accessor('isActive', {
          header: () => t('customers.status'),
          cell: ({ row }) =>
            row.original.archivedAt ? (
              <ArchivedBadge />
            ) : row.original.isActive ? (
              <Badge variant="success">{t('users.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('users.inactive')}</Badge>
            ),
          meta: { className: 'hidden @[24rem]:table-cell' },
        }),
        ...((canEdit || canDelete) && !archived
          ? [
              column.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={t('common.edit')}
                        title={t('common.edit')}
                        onClick={() => {
                          setEditError(null)
                          if (row.original.type === 'pharmacy') setEditingPharmacy(row.original)
                          else void doctorsGet(row.original.id).then(setEditingDoctor).catch(setEditError)
                        }}
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
    [t, canEdit, canDelete, archived, target],
  )

  const isFiltered = search !== '' || type !== '' || status !== 'active'

  return (
    <>
      <PageHeader title={t('customers.title')} description={t('customers.hint')} />
      <FormError error={editError} />
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
        empty={
          archived
            ? { icon: BuildingIcon, title: t('archive.empty') }
            : { icon: BuildingIcon, title: t('customers.empty'), description: t('customers.emptyHint') }
        }
        selection={(archived ? canRestore : canDelete) ? selection : undefined}
        rowLabel={(c) => localizedName(c.name, c.nameAr)}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => customersBulkRestore({ ids })}
              onDone={() => {
                void queryClient.invalidateQueries({ queryKey: ['/api/customers'] })
                void queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
              }}
            />
          ) : (
            <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
              <Trash2Icon />
              {t('bulk.deleteSelected')}
            </Button>
          )
        }
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
          consequence={t('customers.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
      {editingPharmacy && (
        <PharmacyEditDialog
          key={editingPharmacy.id}
          customer={editingPharmacy}
          onClose={() => setEditingPharmacy(null)}
        />
      )}
      {editingDoctor && (
        <DoctorEditDialog
          key={editingDoctor.id}
          doctor={editingDoctor}
          onClose={() => setEditingDoctor(null)}
        />
      )}
    </>
  )
}
