import { useInfiniteQuery } from '@tanstack/react-query'
import { ClockIcon, Loader2Icon, SearchIcon, StethoscopeIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { doctorsList } from '@/api/generated/endpoints'
import type { DayOfWeek, DoctorDto, DoctorsListParams } from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { localizedName } from '@/lib/format'
import { matchingSlots, toMinutes, WEEKDAYS } from './availability'
import { TownSelect } from './doctor-fields'
import { SlotText } from './DoctorSchedule'

const PAGE_SIZE = 20

interface HoursFilter {
  name: string
  weekday: DayOfWeek | ''
  from: string
  to: string
  areaId: string
  townId: string
}

const EMPTY: HoursFilter = { name: '', weekday: '', from: '', to: '', areaId: '', townId: '' }

/**
 * Find doctors by name, visiting day, time range, area and town (each optional, any combination), filtered
 * and paged on the server with the same scoping as the lists. With a day or time, doctors with a matching
 * slot come first (the matching slots are shown on the row); doctors with no hours set follow in their own
 * group when an area or town is chosen.
 */
export function DoctorHoursSearch({
  open,
  onOpenChange,
  mine,
  listOf,
  onOpenDoctor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Only the caller's own list (the rep app). */
  mine?: boolean
  /** Only this rep's list (a manager looking at one rep). */
  listOf?: string
  onOpenDoctor: (doctor: DoctorDto) => void
}) {
  const { t } = useTranslation()
  const { towns } = useDoctorReferenceData()
  const [filter, setFilter] = useState<HoursFilter>(EMPTY)
  const set = (patch: Partial<HoursFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const rangeInvalid =
    filter.from !== '' && filter.to !== '' && (toMinutes(filter.to) ?? 0) <= (toMinutes(filter.from) ?? 0)
  const name = useDebouncedValue(filter.name.trim(), 300)
  const active =
    name !== '' ||
    filter.weekday !== '' ||
    filter.from !== '' ||
    filter.to !== '' ||
    filter.areaId !== '' ||
    filter.townId !== ''
  const byHours = filter.weekday !== '' || filter.from !== '' || filter.to !== ''

  const areas = useMemo(() => {
    const byId = new Map<string, string>()
    for (const town of towns.data ?? []) {
      if (town.areaId) byId.set(town.areaId, localizedName(town.areaName, town.areaNameAr))
    }
    return [...byId].map(([id, label]) => ({ id, name: label }))
  }, [towns.data])
  const areaTowns = (towns.data ?? []).filter((town) => !filter.areaId || town.areaId === filter.areaId)

  const params: DoctorsListParams = {
    ...(mine ? { Mine: true } : listOf ? { ListOf: listOf } : {}),
    ...(name ? { Search: name } : {}),
    ...(filter.weekday ? { Weekday: filter.weekday } : {}),
    ...(filter.from ? { TimeFrom: filter.from } : {}),
    ...(filter.to ? { TimeTo: filter.to } : {}),
    ...(filter.areaId ? { AreaId: filter.areaId } : {}),
    ...(filter.townId ? { TownId: filter.townId } : {}),
    PageSize: PAGE_SIZE,
  }
  const results = useInfiniteQuery({
    queryKey: ['/api/doctors', 'hours-search', params],
    queryFn: ({ pageParam, signal }) => doctorsList({ ...params, Page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length + 1 : undefined),
    enabled: open && active && !rangeInvalid,
    meta: { silent: true },
  })
  const doctors = useMemo(() => results.data?.pages.flat() ?? [], [results.data])
  const matching = byHours ? doctors.filter((d) => (d.availability ?? []).length > 0) : doctors
  const noHours = byHours ? doctors.filter((d) => (d.availability ?? []).length === 0) : []

  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name
  const renderDoctor = (doctor: DoctorDto, showSlots: boolean) => {
    const slots = showSlots ? matchingSlots(doctor.availability, filter) : []
    return (
      <li key={doctor.id}>
        <button
          type="button"
          className="grid w-full gap-1 rounded-card border bg-card p-3 text-start shadow-card hover:bg-accent/60"
          onClick={() => onOpenDoctor(doctor)}
          data-testid="hours-result"
        >
          <span className="font-semibold">{localizedName(doctor.name, doctor.nameAr)}</span>
          <span className="text-sm text-muted-foreground">
            {[
              localizedName(doctor.specialtyNameEn, doctor.specialtyNameAr),
              areaName(doctor.areaId),
              localizedName(doctor.townName, doctor.townNameAr),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {slots.length > 0 && (
            <span className="flex flex-wrap gap-1" data-testid="hours-result-slots">
              {slots.map((slot, index) => (
                <Badge key={index} variant="secondary" className="font-normal">
                  <ClockIcon />
                  {t(`doctors.weekdays.${slot.weekday}`)} <SlotText slot={slot} />
                </Badge>
              ))}
            </span>
          )}
        </button>
      </li>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] flex-col gap-0 p-0"
        data-testid="doctor-hours-search"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('doctors.hoursSearch.title')}</SheetTitle>
          <SheetDescription>{t('doctors.hoursSearch.hint')}</SheetDescription>
          <div className="mt-2 grid grid-cols-2 gap-2 [&_input]:h-11 [&_select]:h-11">
            <div className="col-span-2 grid gap-1">
              <Label htmlFor="hours-name" className="text-xs">
                {t('doctors.hoursSearch.name')}
              </Label>
              <Input
                id="hours-name"
                type="search"
                value={filter.name}
                placeholder={t('doctors.hoursSearch.namePlaceholder')}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="col-span-2 grid gap-1">
              <Label htmlFor="hours-weekday" className="text-xs">
                {t('doctors.hours.weekday')}
              </Label>
              <NativeSelect
                id="hours-weekday"
                value={filter.weekday}
                onChange={(e) => set({ weekday: e.target.value as DayOfWeek | '' })}
              >
                <option value="">{t('doctors.hoursSearch.anyDay')}</option>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {t(`doctors.weekdays.${day}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hours-from" className="text-xs">
                {t('doctors.hours.from')}
              </Label>
              <Input
                id="hours-from"
                type="time"
                dir="ltr"
                value={filter.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hours-to" className="text-xs">
                {t('doctors.hours.to')}
              </Label>
              <Input
                id="hours-to"
                type="time"
                dir="ltr"
                value={filter.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hours-area" className="text-xs">
                {t('doctors.area')}
              </Label>
              <NativeSelect
                id="hours-area"
                value={filter.areaId}
                onChange={(e) => set({ areaId: e.target.value, townId: '' })}
              >
                <option value="">{t('table.all')}</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hours-town" className="text-xs">
                {t('doctors.town')}
              </Label>
              <TownSelect
                id="hours-town"
                towns={areaTowns}
                value={filter.townId}
                onChange={(townId) => set({ townId })}
                allLabel={t('table.all')}
              />
            </div>
            {rangeInvalid && (
              <p className="col-span-2 text-sm text-destructive">{t('doctors.hoursSearch.rangeInvalid')}</p>
            )}
            {active && (
              <Button
                variant="ghost"
                size="sm"
                className="col-span-2 h-11 w-fit"
                onClick={() => setFilter(EMPTY)}
              >
                {t('states.clearFilters')}
              </Button>
            )}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4" data-testid="hours-results">
          {!active ? (
            <EmptyState icon={SearchIcon} title={t('doctors.hoursSearch.start')} />
          ) : results.isLoading ? (
            <LoadingState rows={4} />
          ) : results.error ? (
            <ErrorState error={results.error} onRetry={() => void results.refetch()} />
          ) : doctors.length === 0 ? (
            <EmptyState
              icon={StethoscopeIcon}
              title={t('states.noMatches')}
              description={t('doctors.hoursSearch.noMatchHint')}
            />
          ) : (
            <div className="grid gap-4">
              {matching.length > 0 && (
                <section className="grid gap-2" data-testid="hours-group-matching">
                  {byHours && (
                    <h3 className="px-1 text-sm font-semibold">{t('doctors.hoursSearch.matching')}</h3>
                  )}
                  <ul className="grid gap-2">{matching.map((d) => renderDoctor(d, byHours))}</ul>
                </section>
              )}
              {noHours.length > 0 && (
                <section className="grid gap-2" data-testid="hours-group-none">
                  <h3 className="px-1 text-sm font-semibold">{t('doctors.hours.noHours')}</h3>
                  <ul className="grid gap-2">{noHours.map((d) => renderDoctor(d, false))}</ul>
                </section>
              )}
              {results.hasNextPage && (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={results.isFetchingNextPage}
                  onClick={() => void results.fetchNextPage()}
                  data-testid="hours-more"
                >
                  {results.isFetchingNextPage && <Loader2Icon className="animate-spin" />}
                  {t('doctors.hoursSearch.more')}
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
