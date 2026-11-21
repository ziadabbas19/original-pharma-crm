import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { addDays, isDayKey, relativeDayName, type DayKey } from '@/lib/egypt-day'
import { formatDayLong } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * One day at a time: previous and next day, a button with the day that opens the calendar to jump to
 * any date, and a Today shortcut when another day is shown. Days are Egypt days (see egypt-day.ts).
 */
export function DayPicker({
  value,
  today,
  onChange,
  className,
}: {
  value: DayKey
  today: DayKey
  onChange: (day: DayKey) => void
  className?: string
}) {
  const { t } = useTranslation()
  const relative = relativeDayName(value, today)
  return (
    <div className={cn('flex items-center gap-2', className)} data-testid="day-picker">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addDays(value, -1))}
        aria-label={t('dayPicker.previous')}
        data-testid="day-previous"
      >
        <ChevronLeftIcon className="rtl:rotate-180" />
      </Button>
      <label className="relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border bg-card px-3 text-center shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50">
        <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="grid min-w-0 leading-tight">
          {relative && (
            <span className="text-xs font-semibold text-primary">{t(`dayPicker.${relative}`)}</span>
          )}
          <span className="truncate text-sm font-medium" data-testid="day-label">
            {formatDayLong(value)}
          </span>
        </span>
        {/* The native date picker: the platform calendar on phones. */}
        <input
          type="date"
          value={value}
          onChange={(e) => isDayKey(e.target.value) && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t('dayPicker.choose')}
          data-testid="day-input"
        />
      </label>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addDays(value, 1))}
        aria-label={t('dayPicker.next')}
        data-testid="day-next"
      >
        <ChevronRightIcon className="rtl:rotate-180" />
      </Button>
      {value !== today && (
        <Button variant="soft" onClick={() => onChange(today)} data-testid="day-today">
          {t('dayPicker.today')}
        </Button>
      )}
    </div>
  )
}
