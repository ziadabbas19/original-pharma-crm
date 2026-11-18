import { keepPreviousData } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatsDoctors, useStatsOrders, useStatsVisits } from '@/api/generated/endpoints'
import { ErrorState, LoadingState } from '@/components/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney, formatNumber, formatPercent, localizedName } from '@/lib/format'
import { BarList, Kpi, TrendChart } from './charts'
import { initialFilters, rangeOf, toParams, type Preset, type StatsFilterValues } from './stats-filters'
import { PresetChips } from './PresetChips'

const PRESETS: readonly Preset[] = ['today', 'days7', 'days30', 'thisMonth', 'lastMonth']
const query = { query: { placeholderData: keepPreviousData } }

/** The rep's own numbers: the same server statistics as the dashboard, in a compact layout. */
export function RepStatsPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<StatsFilterValues>(initialFilters)
  const params = useMemo(() => toParams(filters), [filters])
  const orders = useStatsOrders(params, query)
  const visits = useStatsVisits(params, query)
  const doctors = useStatsDoctors(params, query)

  const pick = (preset: Preset) => {
    if (preset !== 'custom') setFilters((f) => ({ ...f, preset, range: rangeOf(preset) }))
  }

  const failed = orders.error ?? visits.error ?? doctors.error
  const o = orders.data
  const v = visits.data
  const d = doctors.data

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('stats.mine')}</h1>
      <PresetChips value={filters.preset} onChange={pick} presets={PRESETS} />
      {failed && !(o && v && d) ? (
        <ErrorState
          error={failed}
          onRetry={() => {
            void orders.refetch()
            void visits.refetch()
            void doctors.refetch()
          }}
        />
      ) : !(o && v && d) ? (
        <LoadingState rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={t('stats.orders')} value={formatNumber(o.orderCount)} />
            <Kpi label={t('stats.orderValue')} value={formatMoney(o.orderValue)} />
            <Kpi label={t('orders.delivery.delivered')} value={formatNumber(o.delivered)} />
            <Kpi label={t('stats.discounts')} value={formatMoney(o.discountTotal)} />
            <Kpi
              label={t('stats.visits')}
              value={formatNumber(v.visitCount)}
              hint={t('stats.verifiedCount', { value: formatNumber(v.verified) })}
            />
            <Kpi
              label={t('stats.coverage')}
              value={formatPercent(d.onLists > 0 ? (d.covered / d.onLists) * 100 : 0)}
              hint={t('stats.coveredOf', {
                covered: formatNumber(d.covered),
                total: formatNumber(d.onLists),
              })}
            />
          </div>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-semibold">{t('stats.salesTrend')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <TrendChart
                label={t('stats.salesTrend')}
                data={o.trend.map((p) => ({ date: p.date, value: p.value ?? 0 }))}
                tooltip={(i) => (
                  <span className="font-semibold tabular-nums">{formatMoney(o.trend[i].value)}</span>
                )}
              />
            </CardContent>
          </Card>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-semibold">{t('stats.topProducts')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {o.topProducts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('stats.noData')}</p>
              ) : (
                <BarList
                  items={o.topProducts.slice(0, 5).map((p) => ({
                    key: p.key,
                    label: localizedName(p.name, p.nameAr),
                    value: p.value ?? 0,
                    display: formatMoney(p.value),
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
