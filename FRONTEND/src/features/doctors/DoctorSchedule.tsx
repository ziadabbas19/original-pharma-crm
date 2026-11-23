import { ClockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DoctorSlotDto } from '@/api/generated/model'
import { cn } from '@/lib/utils'
import { groupByWeekday, normalizeTime } from './availability'

/** A slot as "17:00 - 21:00 · Clinic". */
export function SlotText({ slot }: { slot: DoctorSlotDto }) {
  return (
    <span>
      <span dir="ltr" className="tabular-nums">
        {normalizeTime(slot.start)} - {normalizeTime(slot.end)}
      </span>
      {slot.place && <span className="text-muted-foreground"> · {slot.place}</span>}
    </span>
  )
}

/** Visiting hours grouped by weekday (Saturday first), or "No hours set". */
export function DoctorSchedule({ slots, className }: { slots?: DoctorSlotDto[] | null; className?: string }) {
  const { t } = useTranslation()
  const groups = groupByWeekday(slots)
  return (
    <section className={cn('grid gap-1.5', className)} data-testid="doctor-schedule">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <ClockIcon className="size-4 text-primary" aria-hidden />
        {t('doctors.hours.title')}
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('doctors.hours.noHours')}</p>
      ) : (
        <dl className="grid gap-1 text-sm">
          {groups.map((group) => (
            <div key={group.weekday} className="flex gap-3">
              <dt className="w-24 shrink-0 font-medium">{t(`doctors.weekdays.${group.weekday}`)}</dt>
              <dd className="grid gap-0.5">
                {group.slots.map((slot, index) => (
                  <SlotText key={index} slot={slot} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
