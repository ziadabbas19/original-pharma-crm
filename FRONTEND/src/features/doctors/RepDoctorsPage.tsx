import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ClockIcon,
  HospitalIcon,
  ListPlusIcon,
  PencilIcon,
  PhoneIcon,
  PillIcon,
  PlusIcon,
  StethoscopeIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { doctorsRemoveManyFromMyList, useDoctorsAddToMyList, useDoctorsList } from '@/api/generated/endpoints'
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
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { StartVisitButton } from '@/features/visits/StartVisitButton'
import { fromDoctor, fromPharmacy, useAmPlaces, usePharmacies } from '@/features/visits/use-rep-customers'
import { formatNumber, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { P } from '@/lib/permissions'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { AddPharmacySheet } from '@/features/customers/AddPharmacySheet'
import { AddPlaceSheet } from '@/features/customers/AddPlaceSheet'
import { canAddPharmacy } from '@/features/customers/pharmacy-form'
import { canAddPlace } from '@/features/home/am-places'
import { useAppSelector } from '@/store'
import { AddDoctorSheet } from './AddDoctorSheet'
import { OutsideAreaBadge, SpecialtySelect, TownSelect } from './doctor-fields'
import { DoctorEditDialog } from './DoctorEditDialog'
import { DoctorHoursSearch } from './DoctorHoursSearch'
import { searchByName } from './name-search'

const doctorId = (d: DoctorDto) => d.id
const NO_DOCTORS: DoctorDto[] = []

/** Removing from the list has nothing to preview: the server call only runs on confirm. */
const removeFromList = (request: BulkDeleteRequest): Promise<BulkResult> =>
  doctorsRemoveManyFromMyList({ ids: request.ids })

/** Pharmacies in the rep's area; a visit can start from here as from the doctor list. */
function RepPharmacies() {
  const { t } = useTranslation()
  const pharmacies = usePharmacies()
  const canAdd = useAppSelector((s) => canAddPharmacy(s.permissions.byKey))
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const rows = (pharmacies.data ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || (p.nameAr ?? '').includes(q),
  )

  const addButton = canAdd && (
    <Button size="lg" onClick={() => setAdding(true)} data-testid="add-pharmacy">
      <PlusIcon />
      {t('pharmacies.add')}
    </Button>
  )

  return (
    <div className="space-y-4 [&_input]:h-11">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('visits.pharmacies.pharmacies')}{' '}
          {pharmacies.data && (
            <span className="text-base font-normal text-muted-foreground">
              ({formatNumber(pharmacies.data.length)})
            </span>
          )}
        </h1>
        {(pharmacies.data?.length ?? 0) > 0 && addButton}
      </div>
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
        <EmptyState
          icon={PillIcon}
          title={pharmacies.data?.length ? t('states.noMatches') : t('visits.pharmacies.empty')}
          description={canAdd && !pharmacies.data?.length ? t('pharmacies.emptyHint') : undefined}
          action={pharmacies.data?.length ? undefined : addButton || undefined}
        />
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
      {canAdd && <AddPharmacySheet open={adding} onOpenChange={setAdding} onAdded={() => setSearch('')} />}
    </div>
  )
}

/** AM places (morning visits such as a hospital) of the rep's area, with "Start visit" and "Add place". */
function RepPlaces() {
  const { t } = useTranslation()
  const places = useAmPlaces()
  const { towns } = useDoctorReferenceData()
  const canAdd = useAppSelector((s) => canAddPlace(s.permissions.byKey))
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [townId, setTownId] = useState('')
  const usedTowns = useMemo(() => {
    const ids = new Set((places.data ?? []).map((p) => p.territoryId))
    return (towns.data ?? []).filter((town) => ids.has(town.id))
  }, [places.data, towns.data])
  const q = search.trim().toLowerCase()
  const rows = (places.data ?? []).filter(
    (p) =>
      (!townId || p.territoryId === townId) &&
      (!q || p.name.toLowerCase().includes(q) || (p.nameAr ?? '').includes(q)),
  )
  const addButton = canAdd && (
    <Button size="lg" onClick={() => setAdding(true)} data-testid="add-place">
      <PlusIcon />
      {t('places.add')}
    </Button>
  )

  return (
    <div className="space-y-4 [&_input]:h-11 [&_select]:h-11">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('places.title')}{' '}
          {places.data && (
            <span className="text-base font-normal text-muted-foreground">
              ({formatNumber(places.data.length)})
            </span>
          )}
        </h1>
        {(places.data?.length ?? 0) > 0 && addButton}
      </div>
      <div className="grid gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('places.searchPlaceholder')}
          className="sm:w-full"
        />
        <TownSelect towns={usedTowns} value={townId} onChange={setTownId} allLabel={t('doctors.allTowns')} />
      </div>
      {places.isLoading ? (
        <LoadingState rows={4} />
      ) : places.error && !places.data ? (
        <ErrorState error={places.error} onRetry={() => void places.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HospitalIcon}
          title={places.data?.length ? t('states.noMatches') : t('places.empty')}
          description={canAdd && !places.data?.length ? t('places.emptyHint') : undefined}
          action={places.data?.length ? undefined : addButton || undefined}
        />
      ) : (
        <ul className="space-y-2" data-testid="rep-places">
          {rows.map((p) => (
            <li key={p.id}>
              <Card className="py-3">
                <CardContent className="grid gap-2 px-4">
                  <Link to="/rep/customers/$customerId" params={{ customerId: p.id }} className="min-h-11">
                    <p className="font-medium">{localizedName(p.name, p.nameAr)}</p>
                    <p className="text-sm text-muted-foreground">
                      {[localizedName(p.territoryName, p.territoryNameAr), p.address, p.landmark]
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
      {canAdd && <AddPlaceSheet open={adding} onOpenChange={setAdding} onAdded={() => setSearch('')} />}
    </div>
  )
}

/** The rep's doctors, the pharmacies and the AM places of their area, each with "Start visit". */
export function RepDoctorsPage() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'doctors' | 'pharmacies' | 'places'>('doctors')

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label={t('visits.pharmacies.tabs')}
      >
        {(['doctors', 'pharmacies', 'places'] as const).map((value) => (
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
            {value === 'places' ? t('places.tab') : t(`visits.pharmacies.${value}`)}
          </button>
        ))}
      </div>
      {kind === 'doctors' ? <RepDoctorList /> : kind === 'pharmacies' ? <RepPharmacies /> : <RepPlaces />}
    </div>
  )
}

/**
 * The rep's doctors: "My list" (also offline, searched on the phone with the server's forgiving rules) or
 * "All doctors" in the rep's customers:read scope (searched on the server), with town / specialty
 * filters. Cards add a doctor to the rep's list or take it off; the doctor itself is never deleted.
 */
function RepDoctorList() {
  const { t } = useTranslation()
  const canAdd = usePermission(P.customers.create)
  const queryClient = useQueryClient()
  const [list, setList] = useState<'mine' | 'all'>('mine')
  const copy = readCache<DoctorDto[]>('my-doctors')
  const mine = useDoctorsList(
    { Mine: true },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 60_000 } },
  )
  const { towns, specialties } = useDoctorReferenceData()
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim(), 300)
  const all = useDoctorsList(term ? { Search: term } : {}, {
    query: { enabled: list === 'all', staleTime: 60_000, placeholderData: keepPreviousData },
  })
  const doctors = list === 'mine' ? mine : all
  const [townId, setTownId] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<DoctorDto | null>(null)
  const [searchingHours, setSearchingHours] = useState(false)
  const addToList = useDoctorsAddToMyList()
  const navigate = useNavigate()

  useEffect(() => {
    if (mine.data && mine.isFetchedAfterMount) writeCache('my-doctors', mine.data)
  }, [mine.data, mine.isFetchedAfterMount])

  // Only towns that appear in the list, so the filter stays short.
  const usedTowns = useMemo(() => {
    const ids = new Set((doctors.data ?? []).map((d) => d.townId))
    return (towns.data ?? []).filter((town) => ids.has(town.id))
  }, [doctors.data, towns.data])

  const filtered = useMemo(() => {
    const rows = (doctors.data ?? []).filter(
      (d) => (!townId || d.townId === townId) && (!specialtyId || d.specialtyId === specialtyId),
    )
    // "All doctors" comes searched and ordered from the server; the own list is searched here.
    return list === 'mine'
      ? searchByName(
          rows,
          search,
          (d) => [d.name, d.nameAr],
          (d) => d.phone,
        )
      : rows
  }, [doctors.data, list, search, townId, specialtyId])

  const selection = useSelection(list === 'mine' ? filtered : NO_DOCTORS, doctorId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(removeFromList, ['/api/doctors'], selection)
  const nameOf = (id: string) => {
    const d = doctors.data?.find((x) => x.id === id) ?? mine.data?.find((x) => x.id === id)
    return d ? localizedName(d.name, d.nameAr) : id
  }
  const add = (doctor: DoctorDto) =>
    addToList.mutate(
      { id: doctor.id },
      {
        onSuccess: () => {
          toast.show({ tone: 'success', message: t('doctors.addedToMyList') })
          void queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
        },
      },
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {list === 'mine' ? t('doctors.mine') : t('doctors.lists.all')}{' '}
          {doctors.data && (
            <span className="text-base font-normal text-muted-foreground" data-testid="doctor-count">
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

      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label={t('doctors.lists.label')}
      >
        {(['mine', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={list === value}
            onClick={() => {
              selection.clear()
              setList(value)
            }}
            data-testid={`doctor-list-${value}`}
            className={cn(
              'min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground',
              list === value && 'bg-background text-foreground shadow-xs',
            )}
          >
            {t(`doctors.lists.${value}`)}
          </button>
        ))}
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
        <Button
          variant="outline"
          size="lg"
          onClick={() => setSearchingHours(true)}
          data-testid="open-hours-search"
        >
          <ClockIcon />
          {t('doctors.hoursSearch.open')}
        </Button>
      </div>

      {doctors.isLoading ? (
        <LoadingState rows={5} />
      ) : doctors.error && !doctors.data ? (
        <ErrorState error={doctors.error} onRetry={() => void doctors.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={StethoscopeIcon}
          title={
            doctors.data?.length || term
              ? t('states.noMatches')
              : list === 'mine'
                ? t('doctors.emptyMine')
                : t('doctors.emptyAll')
          }
          description={
            doctors.data?.length || term
              ? t('states.noMatchesHint')
              : list === 'mine'
                ? t('doctors.emptyMineHint')
                : t('doctors.lists.allHint')
          }
        />
      ) : (
        <>
          {canAdd && list === 'mine' && (
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
          <ul className="space-y-2" data-testid="rep-doctors">
            {filtered.map((d) => (
              <li key={d.id} data-testid="rep-doctor">
                <Card className="py-3">
                  <CardContent className="grid gap-2 px-4">
                    <div className="flex items-start justify-between gap-2">
                      {canAdd && list === 'mine' && (
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
                        <p className="font-medium" data-testid="rep-doctor-name">
                          {localizedName(d.name, d.nameAr)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {[
                            localizedName(d.specialtyNameEn, d.specialtyNameAr),
                            localizedName(d.townName, d.townNameAr),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {(d.address || d.landmark) && (
                          <p className="text-sm text-muted-foreground">
                            {[d.address, d.landmark].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </Link>
                      {d.outsideMyArea && <OutsideAreaBadge />}
                    </div>
                    {d.notes && (
                      <p className="text-sm whitespace-pre-line text-muted-foreground">{d.notes}</p>
                    )}
                    {d.onMyList && <StartVisitButton customer={fromDoctor(d)} className="w-full" />}
                    <div className="flex flex-wrap gap-1">
                      {d.phone && (
                        <Button asChild size="lg" variant="outline">
                          <a href={`tel:${d.phone.replace(/\s+/g, '')}`} dir="ltr">
                            <PhoneIcon />
                            {d.phone}
                          </a>
                        </Button>
                      )}
                      {canAdd && d.onMyList && (
                        <>
                          <Button size="lg" variant="ghost" onClick={() => setEditing(d)}>
                            <PencilIcon />
                            {t('doctors.edit')}
                          </Button>
                          <Button
                            size="lg"
                            variant="ghost"
                            onClick={() => target.open([d.id])}
                            data-testid="remove-from-my-list"
                          >
                            <Trash2Icon />
                            {t('doctors.removeFromMyList')}
                          </Button>
                        </>
                      )}
                      {canAdd && !d.onMyList && (
                        <Button
                          size="lg"
                          variant="outline"
                          disabled={addToList.isPending && addToList.variables?.id === d.id}
                          onClick={() => add(d)}
                          data-testid="add-to-my-list"
                        >
                          <ListPlusIcon />
                          {t('doctors.addToMyList')}
                        </Button>
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
        <AddDoctorSheet open={adding} onOpenChange={setAdding} onAdded={() => void mine.refetch()} />
      )}
      {editing && <DoctorEditDialog key={editing.id} doctor={editing} onClose={() => setEditing(null)} />}
      <DoctorHoursSearch
        open={searchingHours}
        onOpenChange={setSearchingHours}
        mine={list === 'mine'}
        onOpenDoctor={(doctor) =>
          void navigate({ to: '/rep/customers/$customerId', params: { customerId: doctor.id } })
        }
      />
    </div>
  )
}
