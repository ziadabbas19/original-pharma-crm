import { createContext, useContext } from 'react'
import type { StatsSection } from '@/api/generated/model'
import type { StatsParams } from './stats-filters'

export interface StatsContextValue {
  params: StatsParams
  canExport: boolean
  section: StatsSection
}

export const StatsContext = createContext<StatsContextValue | null>(null)

export function useStatsContext(): StatsContextValue {
  const value = useContext(StatsContext)
  if (!value) throw new Error('Statistics components need a StatsContext')
  return value
}
