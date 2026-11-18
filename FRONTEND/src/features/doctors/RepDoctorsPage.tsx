import { Link } from '@tanstack/react-router'
import { PencilIcon, PhoneIcon, PillIcon, PlusIcon, StethoscopeIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { doctorsRemoveManyFromMyList, useDoctorsList } from '@/api/generated/endpoints'
import type { BulkDeleteRequest, BulkResult, DoctorDto } from '@/api/generated/model'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { SelectionBar } from '@/components/bulk/SelectionBar'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { SearchInput } from '@/components/data-table/toolbar'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { usePermission } from '@/features/auth/usePermission'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { StartVisitButton } from '@/features/visits/StartVisitButton'
import { fromDoctor, fromPharmacy, usePharmacies } from '@/features/visits/use-rep-customers'
import { formatNumber, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { AddDoctorSheet } from './AddDoctorSheet'
import { OutsideAreaBadge, SpecialtySelect, TownSelect } from './doctor-fields'
import { DoctorEditDialog } from './DoctorEditDialog'

const doctorId = (d: DoctorDto) => d.id

/** Removing from the list has nothing to preview: the server call only runs on confirm. */
const removeFromList = (request: BulkDeleteRequest): Promise<BulkResult> =>
  doctorsRemoveManyFromMyList({ ids: request.ids })

/** Pharmacies in the rep's area; a visit can start from here as from the doctor list. */
function RepPharmacies() {
  const { t } = useTranslation()
  const pharmacies = usePharmacies()
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const rows = (pharmacies.data ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || (p.nameAr ?? '').includes(q),
  )

  return (
    <div className="space-y-4 [&_input]:h-11">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('visits.pharmacies.search')}
        className="sm:w-full"
      />
      {pharmacies.isLoading ? (
        <LoadingState rows={4} />
      ) : pharmacies.error && !pharmacies.data ? (
        <ErrorState error={pharmacies.error} onRetry={() => void pharmacies.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={PillIcon} title={t('visits.pharmacies.empty')} />
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Card className="py-3">
                <CardContent className="grid gap-2 px-4">
                  <Link to="/rep/customers/$customerId" params={{ customerId: p.id }} className="min-h-11">
                    <p className="font-medium">{localizedName(p.name, p.nameAr)}</p>
                    <p className="text-sm text-muted-foreground">
                      {[p.address, localizedName(p.territoryName, p.territoryNameAr)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </Link>
                  <StartVisitButton customer={fromPharmacy(p)} className="w-full" />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The rep's doctors and the pharmacies of their area, each with "Start visit". */
export function RepDoctorsPage() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'doctors' | 'pharmacies'>('doctors')

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label={t('visits.pharmacies.tabs')}
      >
        {(['doctors', 'pharmacies'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            data-testid={`tab-${value}`}
            className={cn(
              'min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground',
              kind === value && 'bg-background text-foreground shadow-xs',
            )}
          >
            {t(`visits.pharmacies.${value}`)}
          </button>
        ))}
      </div>
      {kind === 'doctors' ? <RepDoctorList /> : <RepPharmacies />}
    </div>
  )
}

/** The rep's own doctor list, with search and town / specialty filters. */
function RepDoctorList() {
  const { t } = useTranslation()
  const canAdd = usePermission(P.customers.create)
  const copy = readCache<DoctorDto[]>('my-doctors')
  const doctors = useDoctorsList(
    { Mine: true },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 60_000 } },
  )
  const { towns, specialties } = useDoctorReferenceData()
  const [search, setSearch] = useState('')
  const [townId, setTownId] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<DoctorDto | null>(null)

  useEffect(() => {
    if (doctors.data && doctors.isFetchedAfterMount) writeCache('my-doctors', doctors.data)
  }, [doctors.data, doctors.isFetchedAfterMount])

  // Only towns that appear in the list, so the filter stays short.
  const usedTowns = useMemo(() => {
    const ids = new Set((doctors.data ?? []).map((d) => d.townId))
    return (towns.data ?? []).filter((town) => ids.has(town.id))
  }, [doctors.data, towns.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (doctors.data ?? []).filter(
      (d) =>
        (!townId || d.townId === townId) &&
        (!specialtyId || d.specialtyId === specialtyId) &&
        (!q ||
          d.name.toLowerCase().includes(q) ||
          (d.nameAr ?? '').includes(q) ||
          (d.phone ?? '').includes(q)),
    )
  }, [doctors.data, search, townId, specialtyId])

  const selection = useSelection(filtered, doctorId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(removeFromList, ['/api/doctors'], selection)
  const nameOf = (id: string) => {
    const d = doctors.data?.find((x) => x.id === id)
    return d ? localizedName(d.name, d.nameAr) : id
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('doctors.mine')}{' '}
          {doctors.data && (
            <span className="text-base font-normal text-muted-foreground">
              ({formatNumber(doctors.data.length)})
            </span>
          )}
        </h1>
        {canAdd && (
          <Button size="lg" onClick={() => setAdding(true)}>
            <PlusIcon />
            {t('doctors.add')}
          </Button>
        )}
      </div>

      <div className="grid gap-2 [&_input]:h-11 [&_select]:h-11">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('doctors.searchPlaceholder')}
          className="sm:w-full"
        />
        <div className="grid grid-cols-2 gap-2">
          <TownSelect
            towns={usedTowns}
            value={townId}
            onChange={setTownId}
            allLabel={t('doctors.allTowns')}
          />
          <SpecialtySelect
            specialties={specialties.data ?? []}
            value={specialtyId}
            onChange={setSpecialtyId}
            allLabel={t('doctors.allSpecialties')}
          />
        </div>
      </div>

      {doctors.isLoading ? (
        <LoadingState rows={5} />
      ) : doctors.error && !doctors.data ? (
        <ErrorState error={doctors.error} onRetry={() => void doctors.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={StethoscopeIcon}
          title={doctors.data?.length ? t('states.noMatches') : t('doctors.emptyMine')}
          description={doctors.data?.length ? t('states.noMatchesHint') : t('doctors.emptyMineHint')}
        />
      ) : (
        <>
          {canAdd && (
            <div className="overflow-hidden rounded-lg border">
              <label className="flex min-h-11 items-center gap-2 px-3 py-1 text-sm">
                <Checkbox
                  checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
                  onCheckedChange={(v) => selection.setAll(v === true)}
                />
                {t('bulk.selectAll', { count: selection.total, value: formatNumber(selection.total) })}
              </label>
              <SelectionBar selection={selection} className="static border-t border-b-0">
                <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
                  <Trash2Icon />
                  {t('doctors.removeFromList')}
                </Button>
              </SelectionBar>
            </div>
          )}
          <ul className="space-y-2">
            {filtered.map((d) => (
              <li key={d.id}>
                <Card className="py-3">
                  <CardContent className="grid gap-2 px-4">
                    <div className="flex items-start justify-between gap-2">
                      {canAdd && (
                        <label className="-m-3 flex size-11 shrink-0 items-center justify-center">
                          <Checkbox
                            aria-label={t('bulk.selectRow', { name: localizedName(d.name, d.nameAr) })}
                            checked={selection.has(d.id)}
                            onCheckedChange={(v) => selection.toggle(d.id, v === true)}
                          />
                        </label>
                      )}
                      <Link
                        to="/rep/customers/$customerId"
                        params={{ customerId: d.id }}
                        className="min-h-11 min-w-0 flex-1"
                      >
                        <p className="font-medium">{localizedName(d.name, d.nameAr)}</p>
                        <p className="text-sm text-muted-foreground">
                          {[
                            localizedName(d.specialtyNameEn, d.specialtyNameAr),
                            localizedName(d.townName, d.townNameAr),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </Link>
                      {d.outsideMyArea && <OutsideAreaBadge />}
                    </div>
                    {d.notes && (
                      <p className="text-sm whitespace-pre-line text-muted-foreground">{d.notes}</p>
                    )}
                    <StartVisitButton customer={fromDoctor(d)} className="w-full" />
                    <div className="flex flex-wrap gap-1">
                      {d.phone && (
                        <Button asChild size="lg" variant="outline">
                          <a href={`tel:${d.phone.replace(/\s+/g, '')}`} dir="ltr">
                            <PhoneIcon />
                            {d.phone}
                          </a>
                        </Button>
                      )}
                      {canAdd && (
                        <>
                          <Button size="lg" variant="ghost" onClick={() => setEditing(d)}>
                            <PencilIcon />
                            {t('doctors.edit')}
                          </Button>
                          <Button size="lg" variant="ghost" onClick={() => target.open([d.id])}>
                            <Trash2Icon />
                            {t('doctors.removeFromList')}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          verb="remove"
          preview={false}
          consequence={t('doctors.removeConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
      {canAdd && (
        <AddDoctorSheet open={adding} onOpenChange={setAdding} onAdded={() => void doctors.refetch()} />
      )}
      {editing && <DoctorEditDialog key={editing.id} doctor={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
