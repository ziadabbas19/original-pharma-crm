import { toDateInputValue } from '@/lib/format'

export const PRESETS = ['today', 'days7', 'days30', 'thisMonth', 'lastMonth', 'custom'] as const
export type Preset = (typeof PRESETS)[number]

export interface DateRange {
  from: string
  to: string
}

/** First and last day (local dates, both included) of a preset. */
export function rangeOf(preset: Exclude<Preset, 'custom'>, now = new Date()): DateRange {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const day = (year: number, month: number, date: number) => toDateInputValue(new Date(year, month, date))
  switch (preset) {
    case 'today':
      return { from: day(y, m, d), to: day(y, m, d) }
    case 'days7':
      return { from: day(y, m, d - 6), to: day(y, m, d) }
    case 'days30':
      return { from: day(y, m, d - 29), to: day(y, m, d) }
    case 'thisMonth':
      return { from: day(y, m, 1), to: day(y, m, d) }
    case 'lastMonth':
      return { from: day(y, m - 1, 1), to: day(y, m, 0) }
  }
}

export interface StatsFilterValues {
  preset: Preset
  range: DateRange
  repId: string
  areaId: string
  lineId: string
  productId: string
}

export function initialFilters(): StatsFilterValues {
  return { preset: 'days30', range: rangeOf('days30'), repId: '', areaId: '', lineId: '', productId: '' }
}

/** Query parameters shared by every statistics endpoint. */
export function toParams(filters: StatsFilterValues) {
  return {
    From: filters.range.from || undefined,
    To: filters.range.to || undefined,
    RepId: filters.repId || undefined,
    AreaId: filters.areaId || undefined,
    LineId: filters.lineId || undefined,
    ProductId: filters.productId || undefined,
  }
}

export type StatsParams = ReturnType<typeof toParams>
