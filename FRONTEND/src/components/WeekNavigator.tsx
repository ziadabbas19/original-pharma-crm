import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { addWeeks, isDayKey, weekStartOf, weekdayOf, type DayKey } from '@/lib/egypt-day'
import { formatWeekRange } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Previous and next week, and a button with the week's dates that opens a date picker to jump to the
 * week of any day; "This week" comes back. `value` and `current` are first days of weeks.
 */
export function WeekNavigator({
  value,
  current,
  onChange,
  className,
}: {
  value: DayKey
  current: DayKey
  onChange: (weekStart: DayKey) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="week-navigator">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addWeeks(value, -1))}
        aria-label={t('weekPicker.previous')}
        data-testid="week-previous"
      >
        <ChevronLeftIcon className="rtl:rotate-180" />
      </Button>
      <label className="relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border bg-card px-3 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50">
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-sm font-medium tabular-nums" data-testid="week-label">
          {formatWeekRange(value)}
        </span>
        <input
          type="date"
          value={value}
          onChange={(e) =>
            isDayKey(e.target.value) && onChange(weekStartOf(e.target.value, weekdayOf(current)))
          }
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t('weekPicker.choose')}
          data-testid="week-input"
        />
      </label>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addWeeks(value, 1))}
        aria-label={t('weekPicker.next')}
        data-testid="week-next"
      >
        <ChevronRightIcon className="rtl:rotate-180" />
      </Button>
      {value !== current && (
        // On phones it takes its own row, so the week's dates stay readable.
        <Button
          variant="soft"
          className="max-sm:basis-full"
          onClick={() => onChange(current)}
          data-testid="week-current"
        >
          {t('weekPicker.current')}
        </Button>
      )}
    </div>
  )
}
