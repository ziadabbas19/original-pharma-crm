import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepMonthlyExpensesPage } from '@/features/expenses/RepMonthlyExpensesPage'
import { isMonthKey, type MonthKey } from '@/lib/egypt-day'
import { P } from '@/lib/permissions'

interface ExpensesSearch {
  /** yyyy-MM; the current month when missing. */
  month?: MonthKey
}

export const Route = createFileRoute('/rep/expenses')({
  validateSearch: (search: Record<string, unknown>): ExpensesSearch => ({
    month: isMonthKey(search.month) ? search.month : undefined,
  }),
  component: () => (
    <Can permission={P.expenses.readOwn} fallback={<NoAccess />}>
      <RepMonthlyExpensesPage />
    </Can>
  ),
})
