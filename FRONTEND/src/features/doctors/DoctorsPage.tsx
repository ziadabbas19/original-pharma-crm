import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  MapPinCheckIcon,
  MapPinPlusIcon,
  MapPinnedIcon,
  PencilIcon,
  StethoscopeIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  customersBulkDelete,
  customersBulkRestore,
  useDoctorsList,
  useUsersList,
} from '@/api/generated/endpoints'
import type { DoctorDto } from '@/api/generated/model'
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
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatNumber, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { AssignDoctorsDialog, type RepOption } from './AssignDoctorsDialog'
import { SpecialtySelect, TownSelect } from './doctor-fields'
import { DoctorEditDialog } from './DoctorEditDialog'
import { DoctorLocationSheet } from './DoctorLocationSheet'

const column = dataTableColumns<DoctorDto>()
const doctorId = (d: DoctorDto) => d.id

/** Dashboard doctor lists: who covers which doctor, with filters and assign / transfer. */
export function DoctorsPage() {
  const { t } = useTranslation()
  const canAssign = usePermission(P.customers.assign)
  const canEdit = usePermission(P.customers.manage)
  const canReadUsers = usePermission(P.users.read)
  const canDelete = usePermission(P.customers.delete)
  const canRestore = usePermission(P.customers.restore)
  const queryClient = useQueryClient()
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [repId, setRepId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [townId, setTownId] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [unassigned, setUnassigned] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [editing, setEditing] = useState<DoctorDto | null>(null)
  const [locating, setLocating] = useState<string | null>(null)
  const term = useDebouncedValue(search.trim(), 300)

  const params = {
    RepId: repId || undefined,
    AreaId: areaId || undefined,
    TownId: townId || undefined,
    SpecialtyId: specialtyId || undefined,
    Search: term || undefined,
    Unassigned: unassigned || undefined,
    IncludeInactive: true,
    Archived: archived || undefined,
  }
  const doctors = useDoctorsList(params)
  const users = useUsersList(undefined, { query: { enabled: canReadUsers } })
  const { towns, specialties } = useDoctorReferenceData()

  const areas = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>()
    for (const town of towns.data ?? []) {
      if (town.areaId)
        byId.set(town.areaId, { id: town.areaId, name: localizedName(town.areaName, town.areaNameAr) })
    }
    return [...byId.values()]
  }, [towns.data])

  // Reps to filter by and assign to: users in scope, or (without users:read) the reps seen on the doctors.
  const reps = useMemo<RepOption[]>(() => {
    if (users.data) return users.data.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.fullName }))
    const seen = new Map<string, RepOption>()
    for (const d of doctors.data ?? []) for (const r of d.reps) seen.set(r.id, { id: r.id, name: r.fullName })
    return [...seen.values()].toSorted((a, b) => a.name.localeCompare(b.name))
  }, [users.data, doctors.data])

  const selection = useSelection(doctors.data, doctorId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(customersBulkDelete, ['/api/doctors', '/api/customers'], selection)
  const nameOf = (id: string) => {
    const d = doctors.data?.find((x) => x.id === id)
    return d ? localizedName(d.name, d.nameAr) : id
  }

  const isFiltered =
    search !== '' || repId !== '' || areaId !== '' || townId !== '' || specialtyId !== '' || unassigned
  const clear = () => {
    setSearch('')
    setRepId('')
    setAreaId('')
    setTownId('')
    setSpecialtyId('')
    setUnassigned(false)
  }

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((d) => localizedName(d.name, d.nameAr), {
          id: 'name',
          header: () => t('doctors.name'),
          cell: ({ row }) => (
            <div>
              <span className="font-medium">{localizedName(row.original.name, row.original.nameAr)}</span>
              {row.original.archivedAt ? (
                <span className="ms-2">
                  <ArchivedBadge />
                </span>
              ) : (
                !row.original.isActive && (
                  <Badge variant="outline" className="ms-2">
                    {t('users.inactive')}
                  </Badge>
                )
              )}
              {row.original.phone && (
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {row.original.phone}
                </div>
              )}
            </div>
          ),
        }),
        column.accessor((d) => localizedName(d.specialtyNameEn, d.specialtyNameAr), {
          id: 'specialty',
          header: () => t('doctors.specialty'),
          meta: { className: 'hidden @[53rem]:table-cell' },
        }),
        column.accessor((d) => localizedName(d.townName, d.townNameAr), {
          id: 'town',
          header: () => t('doctors.town'),
          meta: { className: 'hidden @[41rem]:table-cell' },
        }),
        column.accessor((d) => (d.lat != null ? (d.locationSource ?? 'managerSet') : ''), {
          id: 'location',
          header: () => t('doctors.locationHistory.column'),
          cell: ({ row }) =>
            row.original.lat != null ? (
              <span className="inline-flex items-center gap-1.5 text-sm" data-testid="doctor-has-location">
                <MapPinCheckIcon className="size-4 text-success" aria-hidden />
                {row.original.locationSource
                  ? t(`doctors.locationSources.${row.original.locationSource}`)
                  : t('doctors.locationHistory.saved')}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                data-testid="doctor-location-pending"
              >
                <MapPinPlusIcon className="size-4" aria-hidden />
                {t('doctors.locationHistory.pendingShort')}
              </span>
            ),
          meta: { className: 'hidden @[60rem]:table-cell' },
        }),
        column.accessor((d) => d.reps.length, {
          id: 'reps',
          header: () => t('doctors.reps'),
          cell: ({ row }) =>
            row.original.reps.length === 0 ? (
              <span className="text-muted-foreground">{t('doctors.unassigned')}</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {row.original.reps.map((r) => (
                  <Badge
                    key={r.id}
                    variant={r.outsideArea ? 'warning' : 'secondary'}
                    title={r.outsideArea ? t('doctors.outsideAreaHint') : undefined}
                  >
                    {r.outsideArea && <AlertTriangleIcon />}
                    {r.fullName}
                  </Badge>
                ))}
              </div>
            ),
          meta: { className: 'hidden @[33rem]:table-cell' },
        }),
        ...(!archived
          ? [
              column.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('doctors.locationHistory.open')}
                      title={t('doctors.locationHistory.open')}
                      onClick={() => setLocating(row.original.id)}
                      data-testid="doctor-location-open"
                    >
                      <MapPinnedIcon />
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('doctors.edit')}
                        onClick={() => setEditing(row.original)}
                      >
                        <PencilIcon />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
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

  return (
    <>
      <PageHeader title={t('doctors.title')} description={t('doctors.hint')} />
      <DataTable
        columns={columns}
        data={doctors.data}
        isLoading={doctors.isLoading}
        error={doctors.error}
        onRetry={() => void doctors.refetch()}
        getRowId={(d) => d.id}
        initialSorting={[{ id: 'name', desc: false }]}
        filtered={isFiltered}
        onClearFilters={clear}
        empty={{ icon: StethoscopeIcon, title: archived ? t('archive.empty') : t('doctors.empty') }}
        selection={(archived ? canRestore : canAssign || canDelete) ? selection : undefined}
        rowLabel={(d) => localizedName(d.name, d.nameAr)}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => customersBulkRestore({ ids })}
              onDone={() => {
                void queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
                void queryClient.invalidateQueries({ queryKey: ['/api/customers'] })
              }}
            />
          ) : (
            <>
              {canAssign && (
                <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
                  <ArrowRightLeftIcon />
                  {t('doctors.assign.action', { value: formatNumber(selection.count) })}
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
        footer={doctors.data && doctors.data.length >= 1000 ? t('doctors.capped') : undefined}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('doctors.searchPlaceholder')} />
            <FilterField
              label={t('doctors.rep')}
              active={repId !== ''}
              display={reps.find((r) => r.id === repId)?.name}
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
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
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
                  onChange={(e) => setAreaId(e.target.value)}
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
                const town = (towns.data ?? []).find((x) => x.id === townId)
                return town ? localizedName(town.name, town.nameAr) : undefined
              })()}
              onReset={() => setTownId('')}
            >
              {(id) => (
                <TownSelect
                  id={id}
                  className="w-40"
                  towns={towns.data ?? []}
                  value={townId}
                  onChange={setTownId}
                  allLabel={t('table.all')}
                />
              )}
            </FilterField>
            <FilterField
              label={t('doctors.specialty')}
              active={specialtyId !== ''}
              display={(() => {
                const s = (specialties.data ?? []).find((x) => x.id === specialtyId)
                return s ? localizedName(s.nameEn, s.nameAr) : undefined
              })()}
              onReset={() => setSpecialtyId('')}
            >
              {(id) => (
                <SpecialtySelect
                  id={id}
                  className="w-40"
                  specialties={specialties.data ?? []}
                  value={specialtyId}
                  onChange={setSpecialtyId}
                  allLabel={t('table.all')}
                />
              )}
            </FilterField>
            <label className="flex h-9 items-center gap-2 self-end text-sm">
              <Checkbox checked={unassigned} onCheckedChange={(v) => setUnassigned(v === true)} />
              {t('doctors.onlyUnassigned')}
            </label>
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
      {assigning && (
        <AssignDoctorsDialog
          doctorIds={selection.ids}
          reps={reps}
          fromRepId={repId || undefined}
          onClose={() => setAssigning(false)}
          onDone={selection.clear}
        />
      )}
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
      {editing && <DoctorEditDialog key={editing.id} doctor={editing} onClose={() => setEditing(null)} />}
      {locating && (
        <DoctorLocationSheet key={locating} doctorId={locating} onClose={() => setLocating(null)} />
      )}
    </>
  )
}
