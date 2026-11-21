import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { isDayKey, isMonthKey, type DayKey, type MonthKey } from '@/lib/egypt-day'
import { P } from '@/lib/permissions'

interface ExpensesSearch {
  /** Days (a range) or one calendar month. */
  view?: 'month'
  from?: DayKey
  to?: DayKey
  rep?: string
  city?: string
  month?: MonthKey
  /** Rep whose monthly statement is open in the month view. */
  statement?: string
}

const id = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined)

export const Route = createFileRoute('/admin/expenses')({
  validateSearch: (search: Record<string, unknown>): ExpensesSearch => ({
    view: search.view === 'month' ? 'month' : undefined,
    from: isDayKey(search.from) ? search.from : undefined,
    to: isDayKey(search.to) ? search.to : undefined,
    rep: id(search.rep),
    city: id(search.city),
    month: isMonthKey(search.month) ? search.month : undefined,
    statement: id(search.statement),
  }),
  component: () => (
    <Can permission={P.expenses.read} fallback={<NoAccess />}>
      <ExpensesPage />
    </Can>
  ),
})
