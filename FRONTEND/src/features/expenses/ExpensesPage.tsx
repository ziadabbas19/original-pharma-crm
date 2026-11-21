import { getRouteApi } from '@tanstack/react-router'
import { DownloadIcon, ReceiptIcon, UserRoundIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getExpensesExportUrl,
  getExpensesStatementUrl,
  useExpensesMonthReport,
  useExpensesReport,
  useLookupsListTowns,
} from '@/api/generated/endpoints'
import type { ExpenseLineDto, ExpenseReportDto } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterBar } from '@/components/data-table/FilterBar'
import { FilterField } from '@/components/data-table/toolbar'
import { MonthNavigator } from '@/components/MonthNavigator'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiFetch } from '@/lib/api-client'
import { addDays, egyptToday, monthOf, type DayKey } from '@/lib/egypt-day'
import { handleError } from '@/lib/errors'
import { exportCsv } from '@/lib/export-file'
import {
  formatDay,
  formatDayShort,
  formatMoney,
  formatMonth,
  formatNumber,
  localizedName,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { DayExpensesCard } from './DayExpensesCard'
import { MonthStatement } from './MonthExpenses'
import { useMonthExpenses } from './use-month-expenses'

const route = getRouteApi('/admin/expenses')
const column = dataTableColumns<ExpenseLineDto>()

/**
 * Reps' expenses for managers, within their expenses:read scope: day by day over a range, and per
 * calendar month with totals per rep, city and day and each rep's monthly statement.
 */
export function ExpensesPage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const view = search.view ?? 'days'
  return (
    <>
      <PageHeader title={t('expenses.title')} description={t('expenses.hint')} />
      <div className="mb-4 inline-flex rounded-control border bg-card p-0.5" role="tablist">
        {(['days', 'month'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            onClick={() =>
              void navigate({
                search: (s) => ({ ...s, view: tab === 'days' ? undefined : tab }),
                replace: true,
              })
            }
            className={cn(
              'min-h-11 rounded-[10px] px-4 text-sm font-medium',
              view === tab ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`expenses-tab-${tab}`}
          >
            {t(`expenses.views.${tab}`)}
          </button>
        ))}
      </div>
      {view === 'days' ? <DaysView /> : <MonthView />}
    </>
  )
}

function useReps(report: ExpenseReportDto | undefined) {
  return useMemo(() => (report?.byRep ?? []).map((r) => [r.userId, r.userName] as const), [report])
}

function DaysView() {
  const { t, i18n } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const today = egyptToday()
  const from = search.from ?? addDays(today, -6)
  const to = search.to ?? today
  const set = (patch: Partial<typeof search>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  const towns = useLookupsListTowns()
  const report = useExpensesReport({ from, to, userId: search.rep, cityId: search.city })
  // Every rep with expenses in the range, also while one of them is chosen.
  const allReps = useReps(useExpensesReport({ from, to }).data)
  const [open, setOpen] = useState<{ userId: string; userName: string; day: DayKey } | null>(null)
  const [exporting, setExporting] = useState(false)

  const columns = useMemo(
    () => [
      column.accessor('day', {
        header: t('expenses.columns.day'),
        cell: (info) => <span className="tabular-nums">{formatDay(info.getValue())}</span>,
        sortFn: 'text',
      }),
      column.accessor('userName', { header: t('expenses.columns.rep') }),
      column.accessor((l) => localizedName(l.cityName, l.cityNameAr), {
        id: 'city',
        header: t('expenses.columns.city'),
      }),
      column.accessor('amount', {
        header: t('expenses.columns.amount'),
        cell: (info) => <span className="font-semibold tabular-nums">{formatMoney(info.getValue())}</span>,
        meta: { className: 'text-end' },
      }),
      column.accessor('originalAmount', {
        header: t('expenses.columns.original'),
        cell: (info) => {
          const value = info.getValue()
          return value === null ? '—' : <span className="tabular-nums">{formatMoney(value)}</span>
        },
        meta: { className: 'text-end' },
        enableSorting: false,
      }),
      column.accessor('kind', {
        header: t('expenses.columns.source'),
        cell: (info) => (
          <Badge
            variant={
              info.getValue() === 'edited'
                ? 'warning'
                : info.getValue() === 'manual'
                  ? 'outline'
                  : 'secondary'
            }
          >
            {t(`expenses.kinds.${info.getValue()}`)}
          </Badge>
        ),
      }),
      column.accessor('note', {
        header: t('expenses.columns.note'),
        cell: (info) => (
          <span className="line-clamp-2 text-sm text-muted-foreground">{info.getValue() ?? ''}</span>
        ),
        enableSorting: false,
      }),
    ],
    [t],
  )

  const download = async () => {
    setExporting(true)
    try {
      const text = await apiFetch<string>(
        getExpensesExportUrl({
          from,
          to,
          userId: search.rep,
          cityId: search.city,
          lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar',
        }),
        { headers: { Accept: 'text/csv' } },
      )
      await exportCsv(`expenses-${from}-${to}.csv`, text)
    } catch (e) {
      handleError(e, { context: 'expenses.export' })
    } finally {
      setExporting(false)
    }
  }

  const data = report.data
  const repName = (id: string) => allReps.find(([rid]) => rid === id)?.[1]
  const cityName = (id: string) => {
    const town = (towns.data ?? []).find((c) => c.id === id)
    return town ? localizedName(town.name, town.nameAr) : undefined
  }

  return (
    <div className="grid gap-4">
      <Card className="py-3">
        <CardContent className="px-3">
          <FilterBar
            onClearFilters={
              search.rep || search.city ? () => set({ rep: undefined, city: undefined }) : undefined
            }
          >
            <FilterField label={t('expenses.from')} active={false}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  dir="ltr"
                  className="h-9 w-40"
                  value={from}
                  max={to}
                  onChange={(e) => e.target.value && set({ from: e.target.value })}
                />
              )}
            </FilterField>
            <FilterField label={t('expenses.to')} active={false}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  dir="ltr"
                  className="h-9 w-40"
                  value={to}
                  min={from}
                  onChange={(e) => e.target.value && set({ to: e.target.value })}
                />
              )}
            </FilterField>
            <FilterField
              label={t('expenses.columns.rep')}
              active={!!search.rep}
              display={search.rep ? repName(search.rep) : undefined}
              onReset={() => set({ rep: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-44"
                  value={search.rep ?? ''}
                  onChange={(e) => set({ rep: e.target.value || undefined })}
                >
                  <option value="">{t('table.all')}</option>
                  {allReps.map(([rid, name]) => (
                    <option key={rid} value={rid}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('expenses.columns.city')}
              active={!!search.city}
              display={search.city ? cityName(search.city) : undefined}
              onReset={() => set({ city: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-44"
                  value={search.city ?? ''}
                  onChange={(e) => set({ city: e.target.value || undefined })}
                >
                  <option value="">{t('table.all')}</option>
                  {(towns.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {localizedName(c.name, c.nameAr)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <Button
              variant="outline"
              className="ms-auto"
              onClick={() => void download()}
              disabled={exporting || !data?.lines.length}
            >
              <DownloadIcon />
              {t('expenses.exportCsv')}
            </Button>
          </FilterBar>
        </CardContent>
      </Card>

      {data && <Totals report={data} />}

      <DataTable
        columns={columns}
        data={data?.lines}
        isLoading={report.isLoading}
        error={report.error}
        onRetry={() => void report.refetch()}
        getRowId={(l) => l.id}
        initialSorting={[{ id: 'day', desc: true }]}
        onRowClick={(l) => setOpen({ userId: l.userId, userName: l.userName, day: l.day })}
        empty={{ title: t('expenses.emptyRange'), icon: ReceiptIcon }}
        footer={data?.truncated ? t('expenses.truncated') : undefined}
      />

      <Sheet open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg" data-testid="rep-day-expenses">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.userName}</SheetTitle>
                <SheetDescription>{formatDay(open.day)}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <DayExpensesCard day={open.day} userId={open.userId} mode="manage" />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** Total, and the totals per rep, city and day of a report. */
function Totals({ report }: { report: ExpenseReportDto }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <TotalList
        title={t('expenses.byRep')}
        total={report.total}
        rows={report.byRep.map((r) => ({ key: r.userId, label: r.userName, value: r.total }))}
        testId="totals-rep"
      />
      <TotalList
        title={t('expenses.byCity')}
        rows={report.byCity.map((c) => ({
          key: c.cityId,
          label: localizedName(c.cityName, c.cityNameAr),
          value: c.total,
        }))}
        testId="totals-city"
      />
      <TotalList
        title={t('expenses.byDay')}
        rows={report.byDay.map((d) => ({ key: d.day, label: formatDayShort(d.day), value: d.total }))}
        testId="totals-day"
      />
    </div>
  )
}

function TotalList({
  title,
  rows,
  total,
  testId,
  onPick,
  picked,
}: {
  title: string
  rows: { key: string; label: string; value: number }[]
  total?: number
  testId: string
  onPick?: (key: string) => void
  picked?: string
}) {
  const { t } = useTranslation()
  return (
    <Card className="gap-2 py-4" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {total !== undefined && (
          <span className="text-sm font-semibold tabular-nums" data-testid={`${testId}-total`}>
            {t('expenses.grandTotal')}: {formatMoney(total)}
          </span>
        )}
      </CardHeader>
      <CardContent className="max-h-72 overflow-y-auto px-4">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('expenses.none')}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const content = (
                <>
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="font-semibold tabular-nums">{formatMoney(row.value)}</span>
                </>
              )
              return (
                <li key={row.key}>
                  {onPick ? (
                    <button
                      type="button"
                      onClick={() => onPick(row.key)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-md px-1 text-start text-sm hover:bg-accent',
                        picked === row.key && 'bg-primary-soft text-primary',
                      )}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex min-h-10 items-center gap-3 px-1 text-sm">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function MonthView() {
  const { t, i18n } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const current = monthOf(egyptToday())
  const month = search.month ?? current
  const set = (patch: Partial<typeof search>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  const report = useExpensesMonthReport({ month })
  const [exporting, setExporting] = useState<string | null>(null)

  const download = async (userId?: string) => {
    setExporting(userId ?? 'all')
    try {
      const text = await apiFetch<string>(
        getExpensesStatementUrl({ month, userId, lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar' }),
        { headers: { Accept: 'text/csv' } },
      )
      await exportCsv(`expenses-statement-${month}${userId ? `-${userId.slice(0, 8)}` : ''}.csv`, text)
    } catch (e) {
      handleError(e, { context: 'expenses.statement' })
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthNavigator
          className="w-full sm:max-w-md sm:min-w-0 sm:flex-1"
          value={month}
          current={current}
          onChange={(next) => set({ month: next === current ? undefined : next, statement: undefined })}
        />
        <Button
          variant="outline"
          onClick={() => void download()}
          disabled={exporting !== null || !report.data?.lines.length}
        >
          <DownloadIcon />
          {t('expenses.exportStatements')}
        </Button>
      </div>

      {report.isLoading ? (
        <LoadingState rows={4} />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.data && report.data.lines.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title={t('expenses.emptyMonth')} description={formatMonth(month)} />
      ) : report.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <TotalList
              title={t('expenses.byRep')}
              total={report.data.total}
              rows={report.data.byRep.map((r) => ({ key: r.userId, label: r.userName, value: r.total }))}
              testId="month-totals-rep"
              onPick={(userId) => set({ statement: userId })}
              picked={search.statement}
            />
            <TotalList
              title={t('expenses.byCity')}
              rows={report.data.byCity.map((c) => ({
                key: c.cityId,
                label: localizedName(c.cityName, c.cityNameAr),
                value: c.total,
              }))}
              testId="month-totals-city"
            />
            <TotalList
              title={t('expenses.byDay')}
              rows={report.data.byDay.map((d) => ({
                key: d.day,
                label: formatDayShort(d.day),
                value: d.total,
              }))}
              testId="month-totals-day"
            />
          </div>
          {search.statement ? (
            <RepStatement
              month={month}
              userId={search.statement}
              exporting={exporting === search.statement}
              onExport={() => void download(search.statement)}
            />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRoundIcon className="size-4" aria-hidden />
              {t('expenses.pickRep')}
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

function RepStatement({
  month,
  userId,
  exporting,
  onExport,
}: {
  month: string
  userId: string
  exporting: boolean
  onExport: () => void
}) {
  const { t } = useTranslation()
  const { query, data } = useMonthExpenses(month, userId, false)
  if (!data)
    return query.error ? (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    ) : (
      <LoadingState rows={3} />
    )
  return (
    <section className="grid gap-3" data-testid="rep-statement">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t('expenses.statementOf', { name: data.userName, month: formatMonth(month) })}
        </h2>
        <Button variant="outline" onClick={onExport} disabled={exporting}>
          <DownloadIcon />
          {t('expenses.exportCsv')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('expenses.daysWithExpenses', {
          count: data.daysWithExpenses,
          value: formatNumber(data.daysWithExpenses),
        })}
      </p>
      <MonthStatement data={data} showLines />
    </section>
  )
}
