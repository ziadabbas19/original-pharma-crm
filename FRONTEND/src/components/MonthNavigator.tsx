import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { addMonths, isMonthKey, type MonthKey } from '@/lib/egypt-day'
import { formatMonth } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Previous and next calendar month, and a button with the month that opens a picker to jump to any month. */
export function MonthNavigator({
  value,
  current,
  onChange,
  className,
}: {
  value: MonthKey
  current: MonthKey
  onChange: (month: MonthKey) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex items-center gap-2', className)} data-testid="month-navigator">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addMonths(value, -1))}
        aria-label={t('monthPicker.previous')}
        data-testid="month-previous"
      >
        <ChevronLeftIcon className="rtl:rotate-180" />
      </Button>
      <label className="relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border bg-card px-3 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50">
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-sm font-medium" data-testid="month-label">
          {formatMonth(value)}
        </span>
        <input
          type="month"
          value={value}
          onChange={(e) => isMonthKey(e.target.value) && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t('monthPicker.choose')}
          data-testid="month-input"
        />
      </label>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addMonths(value, 1))}
        aria-label={t('monthPicker.next')}
        data-testid="month-next"
      >
        <ChevronRightIcon className="rtl:rotate-180" />
      </Button>
      {value !== current && (
        <Button variant="soft" onClick={() => onChange(current)} data-testid="month-current">
          {t('monthPicker.current')}
        </Button>
      )}
    </div>
  )
}
