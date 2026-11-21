import { Link } from '@tanstack/react-router'
import {
  CalendarRangeIcon,
  ChevronRightIcon,
  MapPinIcon,
  PencilLineIcon,
  ReceiptIcon,
  StickyNoteIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExpenseMonthDto } from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DayKey, MonthKey } from '@/lib/egypt-day'
import { formatDayShort, formatMoney, formatMonth, formatNumber, localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMonthExpenses } from './use-month-expenses'

/** "Expenses of the month" under the day: the total, the days with expenses, and the way to the full month. */
export function MonthExpensesCard({ month }: { month: MonthKey }) {
  const { t } = useTranslation()
  const { query, data } = useMonthExpenses(month, undefined, true)
  return (
    <Card className="gap-2 py-4" data-testid="month-expenses">
      <CardContent className="grid gap-3 px-4">
        {!data ? (
          query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <LoadingState rows={1} />
          )
        ) : (
          <Link
            to="/rep/expenses"
            search={{ month }}
            className="flex items-center gap-3 rounded-control"
            data-testid="month-expenses-link"
          >
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary-soft text-primary-soft-foreground">
              <CalendarRangeIcon className="size-5" aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="text-sm font-semibold">
                {t('expenses.monthTitle', { month: formatMonth(month) })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('expenses.daysWithExpenses', {
                  count: data.daysWithExpenses,
                  value: formatNumber(data.daysWithExpenses),
                })}
              </span>
            </span>
            <span className="text-lg font-bold tabular-nums" data-testid="month-expenses-total">
              {formatMoney(data.total)}
            </span>
            <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The full month: total, days with expenses, a breakdown by city and every day with its total and
 * note marker (the monthly statement). `onOpenDay` makes the days clickable.
 */
export function MonthStatement({
  data,
  dayLink,
  showLines = false,
}: {
  data: ExpenseMonthDto
  /** Where a day leads (the rep's day view). Without it the days are not links. */
  dayLink?: (day: DayKey) => { to: '/rep/visits'; search: { day: DayKey } }
  /** Every line of every day (the printed-statement view for managers). */
  showLines?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4" data-testid="month-statement">
      <div className="grid grid-cols-2 gap-3">
        <Card className="gap-1 py-4">
          <CardContent className="grid gap-0.5 px-4">
            <span className="text-label font-semibold text-muted-foreground">
              {t('expenses.monthTotalLabel')}
            </span>
            <span className="text-2xl font-bold tabular-nums max-sm:text-xl" data-testid="statement-total">
              {formatMoney(data.total)}
            </span>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="grid gap-0.5 px-4">
            <span className="text-label font-semibold text-muted-foreground">{t('expenses.daysLabel')}</span>
            <span className="text-2xl font-bold tabular-nums max-sm:text-xl" data-testid="statement-days">
              {formatNumber(data.daysWithExpenses)}
            </span>
          </CardContent>
        </Card>
      </div>

      {data.days.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title={t('expenses.emptyMonth')} />
      ) : (
        <>
          <Card className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">{t('expenses.byCity')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <ul className="divide-y" data-testid="statement-cities">
                {data.byCity.map((city) => (
                  <li key={city.cityId} className="flex items-center gap-3 py-2 text-sm">
                    <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {localizedName(city.cityName, city.cityNameAr)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('expenses.days', { count: city.days, value: formatNumber(city.days) })}
                    </span>
                    <span className="font-semibold tabular-nums">{formatMoney(city.total)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">{t('expenses.byDay')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <ul className="divide-y" data-testid="statement-days-list">
                {data.days.map((day) => {
                  const edited = day.lines.some((l) => l.kind === 'edited')
                  const content = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 font-medium">
                          {formatDayShort(day.day)}
                          {(day.note || day.managerNote) && (
                            <StickyNoteIcon
                              className="size-3.5 text-muted-foreground"
                              aria-label={t('expenses.hasNote')}
                            />
                          )}
                          {edited && (
                            <Badge variant="warning" className="gap-1">
                              <PencilLineIcon className="size-3" aria-hidden />
                              {t('expenses.kinds.edited')}
                            </Badge>
                          )}
                        </span>
                        {showLines && day.lines.length > 0 && (
                          <span className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                            {day.lines.map((l) => (
                              <span key={l.id} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {localizedName(l.cityName, l.cityNameAr)}
                                  {l.note ? ` - ${l.note}` : ''}
                                </span>
                                <span className="tabular-nums">{formatMoney(l.amount)}</span>
                              </span>
                            ))}
                          </span>
                        )}
                        {showLines && day.note && <span className="mt-1 block text-xs">{day.note}</span>}
                        {showLines && day.managerNote && (
                          <span className="mt-0.5 block text-xs text-primary">{day.managerNote}</span>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(day.total)}</span>
                    </>
                  )
                  return (
                    <li key={day.day}>
                      {dayLink ? (
                        <Link
                          {...dayLink(day.day)}
                          className={cn('flex min-h-12 items-center gap-3 py-2 text-sm hover:bg-accent/50')}
                          data-testid="statement-day"
                        >
                          {content}
                          <ChevronRightIcon
                            className="size-4 text-muted-foreground rtl:rotate-180"
                            aria-hidden
                          />
                        </Link>
                      ) : (
                        <div
                          className="flex min-h-12 items-start gap-3 py-2 text-sm"
                          data-testid="statement-day"
                        >
                          {content}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
