import { useEffect } from 'react'
import { useVisitsRules } from '@/api/generated/endpoints'
import { readCache, writeCache } from '@/lib/offline-cache'
import { DEFAULT_VISIT_RULES, type VisitRules } from './visit-proximity'

const CACHE_KEY = 'visit-rules'

/** The server's verification rules, from the device copy when there is no connection. */
export function useVisitRulesData(): VisitRules {
  const copy = readCache<VisitRules>(CACHE_KEY)
  const rules = useVisitsRules({
    query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 5 * 60_000 },
  })
  useEffect(() => {
    if (rules.data && rules.isFetchedAfterMount) writeCache(CACHE_KEY, rules.data)
  }, [rules.data, rules.isFetchedAfterMount])
  return rules.data ?? DEFAULT_VISIT_RULES
}
