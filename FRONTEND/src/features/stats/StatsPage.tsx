import { keepPreviousData } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLookupsListTowns,
  useProductLinesList,
  useProductsList,
  useStatsCatalog,
  useStatsDoctors,
  useStatsOrders,
  useStatsReps,
  useStatsVisits,
  useUsersList,
} from '@/api/generated/endpoints'
import type { RepRankRow, StatsRange, StatsSection } from '@/api/generated/model'
import { FilterField } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/features/auth/usePermission'
import { formatDay, formatMoney, formatNumber, formatPercent, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { BarList, Kpi, TrendChart } from './charts'
import { StatsContext } from './stats-context'
import {
  initialFilters,
  rangeOf,
  toParams,
  type Preset,
  type StatsFilterValues,
  type StatsParams,
} from './stats-filters'
import { PresetChips } from './PresetChips'
import { BreakdownCard, StatCard } from './StatCard'

const SECTIONS: StatsSection[] = ['orders', 'visits', 'doctors', 'reps', 'catalog']
const query = { query: { placeholderData: keepPreviousData } }

/** Statistics inside the caller's scope: every number is aggregated by the server. */
export function StatsPage() {
  const { t } = useTranslation()
  const canExport = usePermission(P.stats.export)
  const [filters, setFilters] = useState<StatsFilterValues>(initialFilters)
  const [section, setSection] = useState<StatsSection>('orders')
  const params = useMemo(() => toParams(filters), [filters])
  const context = useMemo(() => ({ params, canExport, section }), [params, canExport, section])

  return (
    <StatsContext.Provider value={context}>
      <PageHeader title={t('stats.title')} description={t('stats.hint')} />
      <div className="grid gap-4">
        <Filters filters={filters} onChange={setFilters} />
        <div
          className="flex gap-1 overflow-x-auto rounded-md border bg-card p-0.5"
          role="tablist"
          aria-label={t('stats.title')}
        >
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              onClick={() => setSection(s)}
              className={cn(
                'h-9 shrink-0 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                section === s ? 'bg-accent text-accent-foreground' : 'hover:text-foreground',
              )}
            >
              {t(`stats.sections.${s}`)}
            </button>
          ))}
        </div>
        {section === 'orders' && <OrdersSection params={params} />}
        {section === 'visits' && <VisitsSection params={params} />}
        {section === 'doctors' && <DoctorsSection params={params} />}
        {section === 'reps' && <RepsSection params={params} />}
        {section === 'catalog' && <CatalogSection params={params} />}
      </div>
    </StatsContext.Provider>
  )
}

function Filters({
  filters,
  onChange,
}: {
  filters: StatsFilterValues
  onChange: (next: StatsFilterValues) => void
}) {
  const { t } = useTranslation()
  const canReadUsers = usePermission(P.users.read)
  const canReadProducts = usePermission(P.products.read)
  const users = useUsersList(undefined, { query: { enabled: canReadUsers } })
  const towns = useLookupsListTowns()
  const lines = useProductLinesList(undefined, { query: { enabled: canReadProducts } })
  const products = useProductsList(undefined, { query: { enabled: canReadProducts } })
  const set = (patch: Partial<StatsFilterValues>) => onChange({ ...filters, ...patch })

  const areas = useMemo(() => {
    const byId = new Map<string, string>()
    for (const town of towns.data ?? [])
      if (town.areaId) byId.set(town.areaId, localizedName(town.areaName, town.areaNameAr))
    return [...byId.entries()]
  }, [towns.data])

  const pick = (preset: Preset) => set(preset === 'custom' ? { preset } : { preset, range: rangeOf(preset) })

  return (
    <Card className="py-3">
      <CardContent className="grid gap-3 px-3">
        <PresetChips value={filters.preset} onChange={pick} />
        <div className="flex flex-wrap items-end gap-2">
          {filters.preset === 'custom' && (
            <>
              <FilterField label={t('visits.from')}>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    dir="ltr"
                    className="h-9 w-40"
                    value={filters.range.from}
                    max={filters.range.to}
                    onChange={(e) => set({ range: { ...filters.range, from: e.target.value } })}
                  />
                )}
              </FilterField>
              <FilterField label={t('visits.to')}>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    dir="ltr"
                    className="h-9 w-40"
                    value={filters.range.to}
                    min={filters.range.from}
                    onChange={(e) => set({ range: { ...filters.range, to: e.target.value } })}
                  />
                )}
              </FilterField>
            </>
          )}
          {canReadUsers && (
            <Select label={t('orders.rep')} value={filters.repId} onChange={(repId) => set({ repId })}>
              {(users.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          )}
          <Select label={t('doctors.area')} value={filters.areaId} onChange={(areaId) => set({ areaId })}>
            {areas.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          {canReadProducts && (
            <>
              <Select label={t('catalog.line')} value={filters.lineId} onChange={(lineId) => set({ lineId })}>
                {(lines.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {localizedName(l.nameEn, l.nameAr)}
                  </option>
                ))}
              </Select>
              <Select
                label={t('catalog.product')}
                value={filters.productId}
                onChange={(productId) => set({ productId })}
              >
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {localizedName(p.nameEn, p.nameAr)}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <FilterField label={label}>
      {(id) => (
        <NativeSelect id={id} className="w-40" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('table.all')}</option>
          {children}
        </NativeSelect>
      )}
    </FilterField>
  )
}

/** Loading, failure and "whose numbers are these" around a section. */
function Section<T extends { range: StatsRange }>({
  result,
  children,
}: {
  result: { data?: T; isLoading: boolean; error: unknown; refetch: () => unknown }
  children: (data: T) => ReactNode
}) {
  const { t } = useTranslation()
  if (result.isLoading && !result.data) return <LoadingState rows={6} />
  if (result.error && !result.data)
    return <ErrorState error={result.error} onRetry={() => void result.refetch()} />
  if (!result.data) return null
  const { range } = result.data
  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{t(`stats.scope.${range.scope}`)}</Badge>
        <span className="tabular-nums">
          {formatDay(range.from)} – {formatDay(range.to)}
        </span>
      </p>
      {children(result.data)}
    </div>
  )
}

const KPI_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'
const CARD_GRID = 'grid gap-4 lg:grid-cols-2 2xl:grid-cols-3'

function OrdersSection({ params }: { params: StatsParams }) {
  const { t } = useTranslation()
  const result = useStatsOrders(params, query)
  const money = { key: 'value', label: t('stats.value'), money: true } as const
  const count = { key: 'count', label: t('stats.orders') } as const
  return (
    <Section result={result}>
      {(s) => (
        <>
          <div className={KPI_GRID}>
            <Kpi label={t('stats.orders')} value={formatNumber(s.orderCount)} />
            <Kpi
              label={t('stats.orderValue')}
              value={formatMoney(s.orderValue)}
              hint={t('stats.orderValueHint')}
            />
            <Kpi label={t('stats.averageOrder')} value={formatMoney(s.averageOrderValue)} />
            <Kpi label={t('stats.discounts')} value={formatMoney(s.discountTotal)} />
            <Kpi
              label={t('orders.delivery.delivered')}
              value={formatNumber(s.delivered)}
              hint={formatMoney(s.deliveredValue)}
            />
            <Kpi label={t('orders.delivery.notDelivered')} value={formatNumber(s.notDelivered)} />
          </div>
          <StatCard title={t('stats.salesTrend')} table="trend">
            <TrendChart
              label={t('stats.salesTrend')}
              data={s.trend.map((p) => ({ date: p.date, value: p.value ?? 0 }))}
              tooltip={(i) => (
                <>
                  <span className="font-semibold tabular-nums">{formatMoney(s.trend[i].value)}</span>
                  <span className="tabular-nums">
                    {t('stats.ordersCount', { value: formatNumber(s.trend[i].count) })}
                  </span>
                </>
              )}
            />
          </StatCard>
          <div className={CARD_GRID}>
            <BreakdownCard
              title={t('stats.byStatus')}
              table="byStatus"
              rows={s.byStatus}
              columns={[count, money]}
            />
            <BreakdownCard
              title={t('stats.topProducts')}
              table="topProducts"
              rows={s.topProducts}
              columns={[money, { key: 'quantity', label: t('stats.units') }]}
            />
            <BreakdownCard
              title={t('stats.topLines')}
              table="topLines"
              rows={s.topLines}
              columns={[money, { key: 'quantity', label: t('stats.units') }]}
            />
            <BreakdownCard title={t('stats.byRep')} table="byRep" rows={s.byRep} columns={[money, count]} />
            <BreakdownCard
              title={t('stats.byArea')}
              table="byArea"
              rows={s.byArea}
              columns={[money, count]}
            />
            <BreakdownCard
              title={t('stats.byPlaceType')}
              table="byPlaceType"
              rows={s.byPlaceType}
              columns={[money, count]}
            />
            <BreakdownCard
              title={t('stats.byCollectionMethod')}
              table="byCollectionMethod"
              rows={s.byCollectionMethod}
              columns={[money, count]}
            />
          </div>
        </>
      )}
    </Section>
  )
}

function VisitsSection({ params }: { params: StatsParams }) {
  const { t } = useTranslation()
  const result = useStatsVisits(params, query)
  const visits = { key: 'count', label: t('stats.visits') } as const
  return (
    <Section result={result}>
      {(s) => (
        <>
          <div className={KPI_GRID}>
            <Kpi label={t('stats.visits')} value={formatNumber(s.visitCount)} />
            <Kpi label={t('stats.verified')} value={formatNumber(s.verified)} />
            <Kpi label={t('stats.unverified')} value={formatNumber(s.unverified)} />
            <Kpi label={t('stats.perRepDay')} value={formatNumber(s.averagePerRepDay, 1)} />
            <Kpi label={t('stats.doctorsOnList')} value={formatNumber(s.doctorsOnList)} />
            <Kpi
              label={t('stats.doctorsCovered')}
              value={formatNumber(s.doctorsCovered)}
              hint={
                s.doctorsOnList > 0 ? formatPercent((s.doctorsCovered / s.doctorsOnList) * 100) : undefined
              }
            />
          </div>
          <StatCard title={t('stats.visitsTrend')} table="trend">
            <TrendChart
              tone="actual"
              label={t('stats.visitsTrend')}
              data={s.trend.map((p) => ({ date: p.date, value: p.count }))}
              tooltip={(i) => (
                <span className="font-semibold tabular-nums">
                  {t('stats.visitsCount', { value: formatNumber(s.trend[i].count) })}
                </span>
              )}
            />
          </StatCard>
          <div className={CARD_GRID}>
            <BreakdownCard
              title={t('stats.byRep')}
              table="byRep"
              rows={s.byRep}
              columns={[visits, { key: 'quantity', label: t('stats.verified') }]}
            />
            <BreakdownCard
              title={t('stats.productsDiscussed')}
              table="productsDiscussed"
              rows={s.productsDiscussed}
              columns={[visits]}
            />
            <BreakdownCard
              title={t('stats.feedbackByCategory')}
              table="feedbackByCategory"
              rows={s.feedbackByCategory}
              columns={[{ key: 'count', label: t('visits.feedback.title') }]}
            />
          </div>
          <StatCard title={t('stats.perRepPerDay')} table="perRepPerDay">
            {s.perRepPerDay.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('stats.noData')}</p>
            ) : (
              <div className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('orders.rep')}</TableHead>
                      <TableHead>{t('orders.date')}</TableHead>
                      <TableHead className="text-end">{t('stats.visits')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.perRepPerDay.map((r) => (
                      <TableRow key={`${r.repId}-${r.date}`}>
                        <TableCell>{r.repName}</TableCell>
                        <TableCell className="tabular-nums">{formatDay(r.date)}</TableCell>
                        <TableCell className="text-end tabular-nums">{formatNumber(r.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </StatCard>
        </>
      )}
    </Section>
  )
}

function DoctorsSection({ params }: { params: StatsParams }) {
  const { t } = useTranslation()
  const result = useStatsDoctors(params, query)
  const columns = [
    { key: 'count', label: t('stats.doctorsOnList') },
    { key: 'quantity', label: t('stats.doctorsCovered') },
  ] as const
  return (
    <Section result={result}>
      {(s) => (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={t('stats.doctorsOnList')} value={formatNumber(s.onLists)} />
            <Kpi label={t('stats.doctorsCovered')} value={formatNumber(s.covered)} />
            <Kpi label={t('stats.doctorsNotCovered')} value={formatNumber(s.notCovered)} />
            <Kpi
              label={t('stats.coverage')}
              value={formatPercent(s.onLists > 0 ? (s.covered / s.onLists) * 100 : 0)}
            />
          </div>
          <div className={CARD_GRID}>
            <BreakdownCard title={t('stats.byRep')} table="byRep" rows={s.byRep} columns={[...columns]} />
            <BreakdownCard title={t('stats.byTown')} table="byTown" rows={s.byTown} columns={[...columns]} />
            <BreakdownCard
              title={t('stats.bySpecialty')}
              table="bySpecialty"
              rows={s.bySpecialty}
              columns={[...columns]}
            />
          </div>
          <StatCard title={t('stats.notVisited')} table="notVisited">
            {s.notVisited.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('stats.allVisited')}</p>
            ) : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {s.notVisited.map((d) => (
                  <li key={d.key} className="truncate">
                    {localizedName(d.name, d.nameAr)}
                  </li>
                ))}
              </ul>
            )}
          </StatCard>
        </>
      )}
    </Section>
  )
}

type RankMetric =
  'orderValue' | 'orders' | 'visits' | 'doctorsCovered' | 'trackingHours' | 'activeDays' | 'distanceKm'
const RANK_METRICS: RankMetric[] = [
  'orderValue',
  'orders',
  'visits',
  'doctorsCovered',
  'trackingHours',
  'activeDays',
  'distanceKm',
]

function metricValue(rep: RepRankRow, metric: RankMetric): number {
  return rep[metric] ?? 0
}

function rankDisplay(rep: RepRankRow, metric: RankMetric): string {
  return metric === 'orderValue' ? formatMoney(rep.orderValue) : formatNumber(metricValue(rep, metric), 1)
}

function RepsSection({ params }: { params: StatsParams }) {
  const { t } = useTranslation()
  const result = useStatsReps(params, query)
  const [metric, setMetric] = useState<RankMetric>('orderValue')
  return (
    <Section result={result}>
      {(s) => {
        const ranked = [...s.reps].sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
        return (
          <>
            <StatCard
              title={t('stats.ranking')}
              actions={
                <NativeSelect
                  size="sm"
                  className="w-40"
                  aria-label={t('stats.rankBy')}
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as RankMetric)}
                >
                  {RANK_METRICS.map((m) => (
                    <option key={m} value={m}>
                      {t(`stats.metrics.${m}`)}
                    </option>
                  ))}
                </NativeSelect>
              }
            >
              {ranked.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('stats.noData')}</p>
              ) : (
                <BarList
                  items={ranked.slice(0, 15).map((rep) => ({
                    key: rep.repId,
                    label: rep.name,
                    value: metricValue(rep, metric),
                    display: rankDisplay(rep, metric),
                  }))}
                />
              )}
            </StatCard>
            <StatCard title={t('stats.comparison')} table="reps">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('orders.rep')}</TableHead>
                      {RANK_METRICS.map((m) => (
                        <TableHead key={m} className="text-end whitespace-nowrap">
                          {t(`stats.metrics.${m}`)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranked.map((rep) => (
                      <TableRow key={rep.repId}>
                        <TableCell className="font-medium whitespace-nowrap">{rep.name}</TableCell>
                        {RANK_METRICS.map((m) => (
                          <TableCell key={m} className="text-end whitespace-nowrap tabular-nums">
                            {rankDisplay(rep, m)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t('stats.distanceHint')}</p>
            </StatCard>
          </>
        )
      }}
    </Section>
  )
}

function CatalogSection({ params }: { params: StatsParams }) {
  const { t } = useTranslation()
  const result = useStatsCatalog(params, query)
  return (
    <Section result={result}>
      {(s) => (
        <div className={CARD_GRID}>
          <BreakdownCard
            title={t('stats.productsPerLine')}
            table="productsPerLine"
            rows={s.productsPerLine}
            columns={[
              { key: 'count', label: t('catalog.products') },
              { key: 'quantity', label: t('catalog.stock') },
            ]}
          />
          <BreakdownCard
            title={t('stats.lowStock', { value: formatNumber(s.lowStockThreshold) })}
            table="lowStock"
            rows={s.lowStock}
            columns={[
              { key: 'count', label: t('catalog.stock') },
              { key: 'value', label: t('catalog.price'), money: true },
            ]}
          />
          <BreakdownCard
            title={t('stats.activeUsersByRole')}
            table="activeUsersByRole"
            rows={s.activeUsersByRole}
            columns={[{ key: 'count', label: t('stats.activeUsers') }]}
          />
        </div>
      )}
    </Section>
  )
}
