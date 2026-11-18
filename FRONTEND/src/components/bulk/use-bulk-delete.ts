import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { BulkDeleteRequest, BulkResult } from '@/api/generated/model'
import { invalidateApi } from '@/lib/invalidate-api'
import { type BulkProgress, runInBatches } from './run-in-batches'
import type { Selection } from './use-selection'

/** The ids a delete dialog is open for (null = closed). */
export function useDeleteTarget() {
  const [ids, setIds] = useState<string[] | null>(null)
  const open = useCallback((next: string[]) => setIds(next), [])
  const close = useCallback(() => setIds(null), [])
  return useMemo(() => ({ ids, open, close }), [ids, open, close])
}

/**
 * Wraps a bulk endpoint for the delete dialog: sends large selections in batches, refreshes the given
 * query keys after a real run and keeps the rows that were blocked selected (so the user sees which
 * ones and why).
 */
export function useBulkRunner(
  call: (request: BulkDeleteRequest) => Promise<BulkResult>,
  invalidate: string[],
  selection?: Selection,
) {
  const queryClient = useQueryClient()
  const run = useCallback(
    async (request: BulkDeleteRequest, onProgress?: (progress: BulkProgress) => void) => {
      const dryRun = request.dryRun ?? false
      try {
        return await runInBatches(request.ids, (ids) => call({ ids, dryRun }), { dryRun, onProgress })
      } finally {
        if (!dryRun) await invalidateApi(queryClient, ...invalidate)
      }
    },
    // invalidate is a literal list per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call, queryClient],
  )
  const onDone = useCallback(
    (result: BulkResult) =>
      selection?.keep(result.items.filter((i) => i.outcome === 'blocked').map((i) => i.id)),
    [selection],
  )
  return { run, onDone }
}
