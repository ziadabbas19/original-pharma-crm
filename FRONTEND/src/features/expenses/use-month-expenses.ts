import { useEffect, useMemo } from 'react'
import { useExpensesMonth } from '@/api/generated/endpoints'
import type { ExpenseMonthDto } from '@/api/generated/model'
import type { MonthKey } from '@/lib/egypt-day'
import { readCache, writeCache } from '@/lib/offline-cache'
import { useExpenseOutbox } from './expense-outbox'
import { applyQueuedToMonth } from './expense-queue'

/**
 * A rep's calendar month (1st to last Egypt day). For the rep's own month the changes still waiting
 * on the phone are already counted, so the total moves as soon as a line is changed.
 */
export function useMonthExpenses(month: MonthKey, userId: string | undefined, own: boolean) {
  const cacheKey = `expenses-month-${userId ?? 'me'}-${month}`
  const copy = own ? readCache<ExpenseMonthDto>(cacheKey) : undefined
  const query = useExpensesMonth(
    { month, userId },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 15_000 } },
  )
  const pending = useExpenseOutbox()
  useEffect(() => {
    if (own && query.data && query.isFetchedAfterMount) writeCache(cacheKey, query.data)
  }, [own, cacheKey, query.data, query.isFetchedAfterMount])
  const data = useMemo(
    () => (query.data ? (own ? applyQueuedToMonth(query.data, pending) : query.data) : undefined),
    [query.data, pending, own],
  )
  return { query, data }
}
