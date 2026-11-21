import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeftIcon, DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExpensesStatementUrl } from '@/api/generated/endpoints'
import { MonthNavigator } from '@/components/MonthNavigator'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'
import { egyptToday, monthOf } from '@/lib/egypt-day'
import { handleError } from '@/lib/errors'
import { exportCsv } from '@/lib/export-file'
import { CityAmountsSection } from './CityAmountsSection'
import { MonthStatement } from './MonthExpenses'
import { useMonthExpenses } from './use-month-expenses'

const route = getRouteApi('/rep/expenses')

/** "Monthly expenses": the chosen calendar month of the rep, with a navigator; the current month by default. */
export function RepMonthlyExpensesPage() {
  const { t, i18n } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const current = monthOf(egyptToday())
  const month = search.month ?? current
  const { query, data } = useMonthExpenses(month, undefined, true)
  const [exporting, setExporting] = useState(false)

  const download = async () => {
    setExporting(true)
    try {
      const text = await apiFetch<string>(
        getExpensesStatementUrl({ month, lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar' }),
        { headers: { Accept: 'text/csv' } },
      )
      await exportCsv(`expenses-${month}.csv`, text)
    } catch (e) {
      handleError(e, { context: 'expenses.statement' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="monthly-expenses">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/rep/visits">
            <ArrowLeftIcon className="rtl:rotate-180" />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">{t('expenses.monthlyTitle')}</h1>
        <Button
          variant="outline"
          size="icon"
          onClick={() => void download()}
          disabled={exporting}
          aria-label={t('expenses.exportCsv')}
        >
          <DownloadIcon />
        </Button>
      </div>
      <MonthNavigator
        value={month}
        current={current}
        onChange={(next) =>
          void navigate({ search: { month: next === current ? undefined : next }, replace: true })
        }
      />
      {data ? (
        <MonthStatement data={data} dayLink={(day) => ({ to: '/rep/visits', search: { day } })} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <LoadingState rows={4} />
      )}
      <CityAmountsSection />
    </div>
  )
}
