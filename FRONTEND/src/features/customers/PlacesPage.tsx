import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { HospitalIcon, MapPinCheckIcon, MapPinPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  customersBulkDelete,
  customersBulkRestore,
  useCustomersList,
  useUsersList,
} from '@/api/generated/endpoints'
import type { CustomerDto } from '@/api/generated/model'
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
import { TownSelect } from '@/features/doctors/doctor-fields'
import { canAddPlace } from '@/features/home/am-places'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { useAppSelector } from '@/store'
import { AddPlaceSheet } from './AddPlaceSheet'
import { PharmacyEditDialog } from './PharmacyEditDialog'

const column = dataTableColumns<CustomerDto>()
const placeId = (c: CustomerDto) => c.id

/**
 * AM places (morning visits such as a hospital) for managers and admins: the same filters as the
 * pharmacies (area, town, search), add (optionally on a rep's list), edit and archive.
 */
export function PlacesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canAdd = useAppSelector((s) => canAddPlace(s.permissions.byKey))
  const canAssign = usePermission(P.customers.assign)
  const canReadUsers = usePermission(P.users.read)
  const canEdit = usePermission(P.customers.manage)
  const canDelete = usePermission(P.customers.delete)
  const canRestore = usePermission(P.customers.restore)
  const [search, setSearch] = useState('')
  const [areaId, setAreaId] = useState('')
  const [townId, setTownId] = useState('')
  const [archived, setArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CustomerDto | null>(null)
  const term = useDebouncedValue(search.trim(), 350)
  const places = useCustomersList(
    { type: 'hospital', ...(term ? { search: term } : {}), archived },
    { query: { placeholderData: keepPreviousData } },
  )
  const { towns } = useDoctorReferenceData()
  const users = useUsersList(undefined, { query: { enabled: canAssign && canReadUsers } })
  const reps = useMemo(
    () => (users.data ?? []).filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.fullName })),
    [users.data],
  )

  const areaOf = useMemo(() => new Map((towns.data ?? []).map((town) => [town.id, town])), [towns.data])
  const areas = useMemo(() => {
    const byId = new Map<string, string>()
    for (const town of towns.data ?? [])
      if (town.areaId) byId.set(town.areaId, localizedName(town.areaName, town.areaNameAr))
    return [...byId].map(([id, name]) => ({ id, name }))
  }, [towns.data])
  const filtered = useMemo(
    () =>
      places.data?.filter(
        (p) =>
          (!townId || p.territoryId === townId) &&
          (!areaId || areaOf.get(p.territoryId ?? '')?.areaId === areaId),
      ),
    [places.data, townId, areaId, areaOf],
  )

  const selection = useSelection(filtered, placeId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(customersBulkDelete, ['/api/customers'], selection)
  const nameOf = (id: string) => {
    const c = places.data?.find((x) => x.id === id)
    return c ? localizedName(c.name, c.nameAr) : id
  }

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((c) => localizedName(c.name, c.nameAr), {
          id: 'name',
          header: () => t('places.name'),
          cell: ({ row }) => (
            <div className="min-w-0">
              <div className="font-medium">{localizedName(row.original.name, row.original.nameAr)}</div>
              {(row.original.address || row.original.landmark) && (
                <div className="text-xs text-muted-foreground">
                  {[row.original.address, row.original.landmark].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          ),
        }),
        column.accessor((c) => localizedName(c.territoryName, c.territoryNameAr), {
          id: 'town',
          header: () => t('places.town'),
        }),
        column.accessor(
          (c) => {
            const town = areaOf.get(c.territoryId ?? '')
            return town ? localizedName(town.areaName, town.areaNameAr) : ''
          },
          {
            id: 'area',
            header: () => t('doctors.area'),
            meta: { className: 'hidden @[44rem]:table-cell' },
          },
        ),
        column.display({
          id: 'location',
          header: () => t('customers.location'),
          cell: ({ row }) =>
            row.original.lat != null ? (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <MapPinCheckIcon className="size-4 text-success" aria-hidden />
                {t('doctors.locationHistory.saved')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPinPlusIcon className="size-4" aria-hidden />
                {t('doctors.locationHistory.pendingShort')}
              </span>
            ),
          meta: { className: 'hidden @[52rem]:table-cell' },
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
          meta: { className: 'hidden @[30rem]:table-cell' },
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
                        onClick={() => setEditing(row.original)}
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
    [t, canEdit, canDelete, archived, target, areaOf],
  )

  const isFiltered = search !== '' || areaId !== '' || townId !== ''

  return (
    <>
      <PageHeader
        title={t('places.title')}
        description={t('places.hint')}
        actions={
          canAdd && (
            <Button onClick={() => setAdding(true)} data-testid="admin-add-place">
              <PlusIcon />
              {t('places.add')}
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={places.isLoading}
        error={places.error}
        onRetry={() => void places.refetch()}
        getRowId={(c) => c.id}
        onRowClick={canEdit && !archived ? setEditing : undefined}
        initialSorting={[{ id: 'name', desc: false }]}
        filtered={isFiltered}
        onClearFilters={() => {
          setSearch('')
          setAreaId('')
          setTownId('')
        }}
        empty={
          archived
            ? { icon: HospitalIcon, title: t('archive.empty') }
            : { icon: HospitalIcon, title: t('places.empty'), description: t('places.emptyHint') }
        }
        selection={(archived ? canRestore : canDelete) ? selection : undefined}
        rowLabel={(c) => localizedName(c.name, c.nameAr)}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => customersBulkRestore({ ids })}
              onDone={() => void queryClient.invalidateQueries({ queryKey: ['/api/customers'] })}
            />
          ) : (
            <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
              <Trash2Icon />
              {t('bulk.deleteSelected')}
            </Button>
          )
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('places.searchPlaceholder')} />
            <FilterField
              label={t('doctors.area')}
              active={areaId !== ''}
              display={areas.find((a) => a.id === areaId)?.name}
              onReset={() => setAreaId('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-40"
                  value={areaId}
                  onChange={(e) => {
                    setAreaId(e.target.value)
                    setTownId('')
                  }}
                >
                  <option value="">{t('table.all')}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('doctors.town')}
              active={townId !== ''}
              display={(() => {
                const town = areaOf.get(townId)
                return town ? localizedName(town.name, town.nameAr) : undefined
              })()}
              onReset={() => setTownId('')}
            >
              {(id) => (
                <TownSelect
                  id={id}
                  className="w-40"
                  towns={(towns.data ?? []).filter((town) => !areaId || town.areaId === areaId)}
                  value={townId}
                  onChange={setTownId}
                  allLabel={t('table.all')}
                />
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
          consequence={t('customers.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
      {canAdd && (
        <AddPlaceSheet
          open={adding}
          onOpenChange={setAdding}
          reps={canAssign ? reps : undefined}
          onOpenExisting={(place) => setSearch(place.name)}
        />
      )}
      {editing && <PharmacyEditDialog key={editing.id} customer={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
