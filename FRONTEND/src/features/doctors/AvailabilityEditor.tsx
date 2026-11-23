import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DayOfWeek } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatList } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  addHours,
  SLOT_PLACE_MAX,
  slotProblems,
  weekdayRange,
  WEEKDAYS,
  type SlotProblem,
  type SlotValue,
} from './availability'

/**
 * Visiting hours: choose the working days (one by one or as a range), set the hours once and add
 * them to every chosen day. The slots below are grouped by weekday and each one can still be changed
 * or removed on its own.
 */
export function AvailabilityEditor({
  slots,
  onChange,
  touched,
}: {
  slots: SlotValue[]
  onChange: (slots: SlotValue[]) => void
  touched: boolean
}) {
  const { t } = useTranslation()
  const daysLabel = useId()
  const [days, setDays] = useState<DayOfWeek[]>([])
  const [range, setRange] = useState<{ from: DayOfWeek | ''; to: DayOfWeek | '' }>({ from: '', to: '' })
  const [hours, setHours] = useState({ start: '17:00', end: '21:00', place: '' })
  const [addError, setAddError] = useState<{ problem: SlotProblem; conflicts: DayOfWeek[] } | null>(null)
  const problems = slotProblems(slots)
  const dayName = (day: DayOfWeek) => t(`doctors.weekdays.${day}`)
  const set = (index: number, patch: Partial<SlotValue>) =>
    onChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))
  const groups = WEEKDAYS.map((weekday) => ({
    weekday,
    items: slots.flatMap((slot, index) => (slot.weekday === weekday ? [{ slot, index }] : [])),
  })).filter((group) => group.items.length > 0)

  const toggleDay = (day: DayOfWeek) => {
    setAddError(null)
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]))
  }
  const pickRange = (patch: Partial<typeof range>) => {
    const next = { ...range, ...patch }
    setRange(next)
    setAddError(null)
    if (next.from && next.to) setDays(weekdayRange(next.from, next.to))
  }
  const clear = () => {
    setDays([])
    setRange({ from: '', to: '' })
    setAddError(null)
  }
  const add = () => {
    const result = addHours(slots, days, hours)
    if (result.problem) {
      setAddError({ problem: result.problem, conflicts: result.conflicts })
      return
    }
    onChange(result.slots)
    clear()
  }

  return (
    <fieldset className="grid gap-2" data-testid="doctor-availability">
      <legend className="text-sm font-medium">{t('doctors.hours.title')}</legend>
      <p className="text-xs text-muted-foreground">{t('doctors.hours.hint')}</p>

      <div className="grid gap-2 rounded-xl border bg-muted/40 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span id={daysLabel} className="text-xs font-medium">
            {t('doctors.hours.days')}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            disabled={days.length === 0 && !range.from && !range.to}
            onClick={clear}
            data-testid="doctor-days-clear"
          >
            {t('doctors.hours.clear')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={daysLabel}>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={days.includes(day)}
              onClick={() => toggleDay(day)}
              data-testid="doctor-day-chip"
              data-day={day}
              className={cn(
                'h-11 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                days.includes(day)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {dayName(day)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect
            aria-label={t('doctors.hours.fromDay')}
            selectClassName="h-11"
            value={range.from}
            onChange={(e) => pickRange({ from: e.target.value as DayOfWeek | '' })}
            data-testid="doctor-day-from"
          >
            <option value="">{t('doctors.hours.fromDay')}</option>
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {dayName(day)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('doctors.hours.toDay')}
            selectClassName="h-11"
            value={range.to}
            onChange={(e) => pickRange({ to: e.target.value as DayOfWeek | '' })}
            data-testid="doctor-day-to"
          >
            <option value="">{t('doctors.hours.toDay')}</option>
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {dayName(day)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <span className="mt-1 text-xs font-medium">{t('doctors.hours.sameHours')}</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t('doctors.hours.from')}
            <Input
              type="time"
              dir="ltr"
              className="h-11"
              value={hours.start}
              onChange={(e) => {
                setAddError(null)
                setHours({ ...hours, start: e.target.value })
              }}
              data-testid="doctor-hours-start"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t('doctors.hours.to')}
            <Input
              type="time"
              dir="ltr"
              className="h-11"
              value={hours.end}
              onChange={(e) => {
                setAddError(null)
                setHours({ ...hours, end: e.target.value })
              }}
              data-testid="doctor-hours-end"
            />
          </label>
        </div>
        <Input
          className="h-11"
          value={hours.place}
          maxLength={SLOT_PLACE_MAX}
          placeholder={t('doctors.hours.placePlaceholder')}
          aria-label={t('doctors.hours.place')}
          onChange={(e) => setHours({ ...hours, place: e.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-fit"
          disabled={days.length === 0}
          onClick={add}
          data-testid="doctor-slot-add"
        >
          <PlusIcon />
          {t('doctors.hours.add')}
        </Button>
        {addError && (
          <p className="text-sm text-destructive" role="alert" data-testid="doctor-slot-add-problem">
            {addError.problem === 'overlap'
              ? t('doctors.hours.conflict', { days: formatList(addError.conflicts.map(dayName)) })
              : t(`doctors.hours.problems.${addError.problem}`)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('doctors.hours.sameHoursHint')}</p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          {t('doctors.hours.none')}
        </p>
      ) : (
        <ul className="grid gap-2">
          {groups.map(({ weekday, items }) => (
            <li
              key={weekday}
              className="grid gap-2 rounded-xl border p-2.5"
              data-testid="doctor-slot-day"
              data-day={weekday}
            >
              <span className="text-sm font-semibold">{dayName(weekday)}</span>
              {items.map(({ slot, index }, position) => {
                const problem = problems[index]
                return (
                  <div
                    key={index}
                    className={cn('grid gap-2', position > 0 && 'border-t pt-2')}
                    data-testid="doctor-slot"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        {t('doctors.hours.from')}
                        <Input
                          type="time"
                          dir="ltr"
                          className="h-11"
                          value={slot.start}
                          aria-invalid={touched && problem !== null}
                          onChange={(e) => set(index, { start: e.target.value })}
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        {t('doctors.hours.to')}
                        <Input
                          type="time"
                          dir="ltr"
                          className="h-11"
                          value={slot.end}
                          aria-invalid={touched && problem !== null}
                          onChange={(e) => set(index, { end: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-11"
                        value={slot.place}
                        maxLength={SLOT_PLACE_MAX}
                        placeholder={t('doctors.hours.placePlaceholder')}
                        aria-label={t('doctors.hours.place')}
                        onChange={(e) => set(index, { place: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 text-destructive"
                        aria-label={t('doctors.hours.remove')}
                        onClick={() => onChange(slots.filter((_, i) => i !== index))}
                        data-testid="doctor-slot-remove"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                    {problem && (
                      <p className="text-sm text-destructive" data-testid="doctor-slot-problem">
                        {t(`doctors.hours.problems.${problem}`)}
                      </p>
                    )}
                  </div>
                )
              })}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
