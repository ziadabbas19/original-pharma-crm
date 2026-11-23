import { BuildingIcon, HospitalIcon, MinusIcon, PlusIcon, StethoscopeIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TownDto, WeeklyPlanDayDto, WeeklyPlanDayInput } from '@/api/generated/model'
import { SearchInput } from '@/components/data-table/toolbar'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { DayKey } from '@/lib/egypt-day'
import { handleError, type AppError } from '@/lib/errors'
import { formatDayLong, formatNumber, localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { parseTarget, PLAN_NOTE_MAX, PLAN_TARGET_MAX, type PlanCustomerOption } from './plan-input'

/**
 * Plans one day: the city, how many visits, a note, (optionally) whom to visit, chosen from the rep's
 * customers in that city, and the AM places of the morning, which may be in any town of the rep's area.
 * A bottom sheet on phones.
 */
export function DayPlanDialog({
  day,
  entry,
  towns,
  customers,
  amPlaces = [],
  onSave,
  onRemove,
  onClose,
}: {
  day: DayKey
  entry?: WeeklyPlanDayDto
  towns: TownDto[]
  customers: PlanCustomerOption[]
  /** AM places the rep can plan (any town). */
  amPlaces?: PlanCustomerOption[]
  onSave: (input: WeeklyPlanDayInput) => Promise<void>
  /** Makes the day a day off again (only for a planned day). */
  onRemove?: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [cityId, setCityId] = useState(entry?.cityId ?? '')
  const [target, setTarget] = useState(String(entry?.targetVisits ?? 0))
  const [note, setNote] = useState(entry?.note ?? '')
  const [selected, setSelected] = useState<string[]>(entry?.customers.map((c) => c.customerId) ?? [])
  const [search, setSearch] = useState('')
  const [amSelected, setAmSelected] = useState<string[]>(entry?.amPlaces?.map((c) => c.customerId) ?? [])
  const [amSearch, setAmSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const parsedTarget = parseTarget(target)
  const valid = cityId !== '' && parsedTarget !== null && note.length <= PLAN_NOTE_MAX

  // Towns grouped by area, as the server lists them (area, then name).
  const areas = useMemo(() => {
    const groups = new Map<string, { label: string; towns: TownDto[] }>()
    for (const town of towns) {
      const key = town.areaId ?? ''
      const group = groups.get(key) ?? { label: localizedName(town.areaName, town.areaNameAr), towns: [] }
      group.towns.push(town)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [towns])

  // Customers already on the day stay listed even if they are no longer on the rep's lists.
  const known = useMemo(() => {
    const byId = new Map(customers.map((c) => [c.id, c]))
    for (const c of entry?.customers ?? []) {
      if (!byId.has(c.customerId))
        byId.set(c.customerId, {
          id: c.customerId,
          type: c.type,
          name: c.name,
          nameAr: c.nameAr,
          townId: c.townId,
        })
    }
    return [...byId.values()]
  }, [customers, entry])

  const inCity = useMemo(() => {
    const term = search.trim().toLowerCase()
    return known
      .filter((c) => c.townId === cityId)
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.nameAr ?? '').includes(term))
      .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)))
  }, [known, cityId, search, selected])

  // Places already on the day stay listed even if the rep can no longer see them.
  const amOptions = useMemo(() => {
    const byId = new Map(amPlaces.map((c) => [c.id, c]))
    for (const c of entry?.amPlaces ?? []) {
      if (!byId.has(c.customerId))
        byId.set(c.customerId, {
          id: c.customerId,
          type: c.type,
          name: c.name,
          nameAr: c.nameAr,
          townId: c.townId,
        })
    }
    const term = amSearch.trim().toLowerCase()
    return [...byId.values()]
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.nameAr ?? '').includes(term))
      .sort((a, b) => Number(amSelected.includes(b.id)) - Number(amSelected.includes(a.id)))
  }, [amPlaces, entry, amSearch, amSelected])

  const chooseCity = (next: string) => {
    setCityId(next)
    // Customers must be in the day's city.
    setSelected((ids) => ids.filter((id) => known.find((c) => c.id === id)?.townId === next))
  }

  const step = (by: number) =>
    setTarget(String(Math.min(PLAN_TARGET_MAX, Math.max(0, (parsedTarget ?? 0) + by))))

  const toggle = (id: string, on: boolean) =>
    setSelected((ids) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)))

  const run = async (action: () => Promise<void>, context: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context }))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid || parsedTarget === null) return
    void run(
      () =>
        onSave({
          day,
          cityId,
          targetVisits: parsedTarget,
          note: note.trim() || null,
          customerIds: selected,
          amPlaceIds: amSelected,
        }),
      'plans.saveDay',
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="plan-day-dialog">
        <DialogHeader>
          <DialogTitle>{entry ? t('plans.editDayTitle') : t('plans.planDayTitle')}</DialogTitle>
          <DialogDescription>{formatDayLong(day)}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="plan-city">{t('plans.city')}</Label>
            <NativeSelect
              id="plan-city"
              value={cityId}
              onChange={(e) => chooseCity(e.target.value)}
              selectClassName="h-11"
              aria-invalid={error?.code === 'plan_city_invalid' || undefined}
            >
              <option value="">{t('plans.chooseCity')}</option>
              {areas.map((area) => (
                <optgroup key={area.label} label={area.label}>
                  {area.towns.map((town) => (
                    <option key={town.id} value={town.id}>
                      {localizedName(town.name, town.nameAr)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plan-target">{t('plans.target')}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                onClick={() => step(-1)}
                disabled={(parsedTarget ?? 0) <= 0}
                aria-label={t('plans.targetLess')}
                data-testid="plan-target-less"
              >
                <MinusIcon />
              </Button>
              <Input
                id="plan-target"
                inputMode="numeric"
                dir="ltr"
                className="h-11 w-20 text-center text-lg font-semibold tabular-nums"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                aria-invalid={parsedTarget === null}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                onClick={() => step(1)}
                disabled={(parsedTarget ?? 0) >= PLAN_TARGET_MAX}
                aria-label={t('plans.targetMore')}
                data-testid="plan-target-more"
              >
                <PlusIcon />
              </Button>
              <span className="text-sm text-muted-foreground">{t('plans.visitsUnit')}</span>
            </div>
            {parsedTarget === null && (
              <p className="text-sm text-destructive">
                {t('plans.targetInvalid', { max: formatNumber(PLAN_TARGET_MAX) })}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plan-note">
              {t('plans.note')} <span className="text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Textarea
              id="plan-note"
              value={note}
              maxLength={PLAN_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-end text-xs text-muted-foreground tabular-nums">
              {note.length}/{PLAN_NOTE_MAX}
            </p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('plans.customers')} <span className="text-muted-foreground">({t('common.optional')})</span>
              {selected.length > 0 && (
                <span className="ms-2 text-xs text-primary" data-testid="plan-customers-count">
                  {t('plans.customersChosen', {
                    count: selected.length,
                    value: formatNumber(selected.length),
                  })}
                </span>
              )}
            </legend>
            {cityId === '' ? (
              <p className="text-sm text-muted-foreground">{t('plans.chooseCityFirst')}</p>
            ) : (
              <>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder={t('plans.searchCustomers')}
                  className="sm:w-full [&_input]:h-11"
                />
                {inCity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {search ? t('plans.noCustomerMatch') : t('plans.noCustomersInCity')}
                  </p>
                ) : (
                  <ul
                    className="grid max-h-64 divide-y overflow-y-auto rounded-control border"
                    data-testid="plan-customer-list"
                  >
                    {inCity.map((c) => {
                      const Icon = c.type === 'pharmacy' ? BuildingIcon : StethoscopeIcon
                      const checked = selected.includes(c.id)
                      return (
                        <li key={c.id}>
                          <label
                            className={cn(
                              'flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2',
                              checked && 'bg-primary-soft/50',
                            )}
                            data-testid="plan-customer-option"
                          >
                            <Checkbox checked={checked} onCheckedChange={(on) => toggle(c.id, on === true)} />
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="grid min-w-0 flex-1 leading-tight">
                              <span className="truncate text-sm font-medium">
                                {localizedName(c.name, c.nameAr)}
                              </span>
                              {c.hint && (
                                <span className="truncate text-xs text-muted-foreground">{c.hint}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </fieldset>

          {(amOptions.length > 0 || amSelected.length > 0) && (
            <fieldset className="grid gap-2" data-testid="plan-am-places">
              <legend className="mb-2 text-sm font-medium">
                {t('plans.amPlaces')} <span className="text-muted-foreground">({t('common.optional')})</span>
                {amSelected.length > 0 && (
                  <span className="ms-2 text-xs text-primary">
                    {t('plans.customersChosen', {
                      count: amSelected.length,
                      value: formatNumber(amSelected.length),
                    })}
                  </span>
                )}
              </legend>
              <p className="text-xs text-muted-foreground">{t('plans.amPlacesHint')}</p>
              <SearchInput
                value={amSearch}
                onChange={setAmSearch}
                placeholder={t('places.searchPlaceholder')}
                className="sm:w-full [&_input]:h-11"
              />
              <ul className="grid max-h-56 divide-y overflow-y-auto rounded-control border">
                {amOptions.map((c) => {
                  const checked = amSelected.includes(c.id)
                  const town = towns.find((x) => x.id === c.townId)
                  return (
                    <li key={c.id}>
                      <label
                        className={cn(
                          'flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2',
                          checked && 'bg-primary-soft/50',
                        )}
                        data-testid="plan-am-option"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(on) =>
                            setAmSelected((ids) =>
                              on === true
                                ? [...ids.filter((x) => x !== c.id), c.id]
                                : ids.filter((x) => x !== c.id),
                            )
                          }
                        />
                        <HospitalIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="grid min-w-0 flex-1 leading-tight">
                          <span className="truncate text-sm font-medium">
                            {localizedName(c.name, c.nameAr)}
                          </span>
                          {town && (
                            <span className="truncate text-xs text-muted-foreground">
                              {localizedName(town.name, town.nameAr)}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )}

          <FormError error={error} />
          <DialogFooter>
            {onRemove && (
              <Button
                type="button"
                variant="outlineDestructive"
                className="sm:me-auto"
                onClick={() => void run(onRemove, 'plans.removeDay')}
                disabled={busy}
                data-testid="plan-day-remove"
              >
                <Trash2Icon />
                {t('plans.makeDayOff')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || busy} data-testid="plan-day-save">
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
