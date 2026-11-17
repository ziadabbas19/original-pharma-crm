import { AlertTriangleIcon, ArrowRightLeftIcon, PencilIcon, StethoscopeIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDoctorsList, useUsersList } from '@/api/generated/endpoints'
import type { DoctorDto } from '@/api/generated/model'
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

const column = dataTableColumns<DoctorDto>()
const NONE: string[] = []

/** Dashboard doctor lists: who covers which doctor, with filters and assign / transfer. */
export function DoctorsPage() {
  const { t } = useTranslation()
  const canAssign = usePermission(P.customers.assign)
  const canEdit = usePermission(P.customers.manage)
  const canReadUsers = usePermission(P.users.read)
  const [search, setSearch] = useState('')
  const [repId, setRepId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [townId, setTownId] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [unassigned, setUnassigned] = useState(false)
  const [selected, setSelected] = useState<string[]>(NONE)
  const [assigning, setAssigning] = useState(false)
  const [editing, setEditing] = useState<DoctorDto | null>(null)
  const term = useDebouncedValue(search.trim(), 300)

  const params = {
    RepId: repId || undefined,
    AreaId: areaId || undefined,
    TownId: townId || undefined,
    SpecialtyId: specialtyId || undefined,
    Search: term || undefined,
    Unassigned: unassigned || undefined,
    IncludeInactive: true,
  }
  const doctors = useDoctorsList(params)
  const users = useUsersList({ query: { enabled: canReadUsers } })
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

  const visibleIds = useMemo(() => new Set((doctors.data ?? []).map((d) => d.id)), [doctors.data])
  const selection = selected.filter((id) => visibleIds.has(id))
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => (on ? [...new Set([...current, id])] : current.filter((x) => x !== id)))

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
        ...(canAssign
          ? [
              column.display({
                id: 'select',
                header: () => (
                  <Checkbox
                    aria-label={t('doctors.selectAll')}
                    checked={visibleIds.size > 0 && selection.length === visibleIds.size}
                    onCheckedChange={(v) => setSelected(v === true ? [...visibleIds] : NONE)}
                  />
                ),
                cell: ({ row }) => (
                  <Checkbox
                    aria-label={t('doctors.select', { name: row.original.name })}
                    checked={selection.includes(row.original.id)}
                    onCheckedChange={(v) => toggle(row.original.id, v === true)}
                  />
                ),
              }),
            ]
          : []),
        column.accessor((d) => localizedName(d.name, d.nameAr), {
          id: 'name',
          header: () => t('doctors.name'),
          cell: ({ row }) => (
            <div>
              <span className="font-medium">{localizedName(row.original.name, row.original.nameAr)}</span>
              {!row.original.isActive && (
                <Badge variant="outline" className="ms-2">
                  {t('users.inactive')}
                </Badge>
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
          meta: { className: 'hidden md:table-cell' },
        }),
        column.accessor((d) => localizedName(d.townName, d.townNameAr), {
          id: 'town',
          header: () => t('doctors.town'),
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
        }),
        ...(canEdit
          ? [
              column.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('doctors.edit')}
                      onClick={() => setEditing(row.original)}
                    >
                      <PencilIcon />
                    </Button>
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    [t, canAssign, canEdit, selection, visibleIds],
  )

  return (
    <>
      <PageHeader
        title={t('doctors.title')}
        description={t('doctors.hint')}
        actions={
          canAssign && (
            <Button onClick={() => setAssigning(true)} disabled={selection.length === 0}>
              <ArrowRightLeftIcon />
              {t('doctors.assign.action', { value: formatNumber(selection.length) })}
            </Button>
          )
        }
      />
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
        empty={{ icon: StethoscopeIcon, title: t('doctors.empty') }}
        footer={doctors.data && doctors.data.length >= 1000 ? t('doctors.capped') : undefined}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('doctors.searchPlaceholder')} />
            <FilterField label={t('doctors.rep')}>
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
            <FilterField label={t('doctors.area')}>
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
            <FilterField label={t('doctors.town')}>
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
            <FilterField label={t('doctors.specialty')}>
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
          </>
        }
      />
      {assigning && (
        <AssignDoctorsDialog
          doctorIds={selection}
          reps={reps}
          fromRepId={repId || undefined}
          onClose={() => setAssigning(false)}
          onDone={() => setSelected(NONE)}
        />
      )}
      {editing && <DoctorEditDialog key={editing.id} doctor={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
