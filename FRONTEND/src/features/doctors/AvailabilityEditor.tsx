import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DayOfWeek } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { nextSlot, SLOT_PLACE_MAX, slotProblems, WEEKDAYS, type SlotValue } from './availability'

/** Visiting hours as a simple list: weekday, from, to and an optional place; add and remove slots. */
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
  const problems = slotProblems(slots)
  const set = (index: number, patch: Partial<SlotValue>) =>
    onChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))

  return (
    <fieldset className="grid gap-2" data-testid="doctor-availability">
      <legend className="text-sm font-medium">{t('doctors.hours.title')}</legend>
      <p className="text-xs text-muted-foreground">{t('doctors.hours.hint')}</p>
      {slots.length === 0 && (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          {t('doctors.hours.none')}
        </p>
      )}
      <ul className="grid gap-2">
        {slots.map((slot, index) => {
          const problem = problems[index]
          return (
            <li key={index} className="grid gap-2 rounded-xl border p-2.5" data-testid="doctor-slot">
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label={t('doctors.hours.weekday')}
                  className="h-11 flex-1"
                  value={slot.weekday}
                  onChange={(e) => set(index, { weekday: e.target.value as DayOfWeek })}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(`doctors.weekdays.${day}`)}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 text-destructive"
                  aria-label={t('doctors.hours.remove')}
                  onClick={() => onChange(slots.filter((_, i) => i !== index))}
                >
                  <Trash2Icon />
                </Button>
              </div>
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
              <Input
                className="h-11"
                value={slot.place}
                maxLength={SLOT_PLACE_MAX}
                placeholder={t('doctors.hours.placePlaceholder')}
                aria-label={t('doctors.hours.place')}
                onChange={(e) => set(index, { place: e.target.value })}
              />
              {problem && (
                <p className="text-sm text-destructive" data-testid="doctor-slot-problem">
                  {t(`doctors.hours.problems.${problem}`)}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-fit"
        onClick={() => onChange([...slots, nextSlot(slots)])}
        data-testid="doctor-slot-add"
      >
        <PlusIcon />
        {t('doctors.hours.add')}
      </Button>
    </fieldset>
  )
}
