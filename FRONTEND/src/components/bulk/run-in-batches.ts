import type { BulkItemResult, BulkResult } from '@/api/generated/model'

/** The most items the API accepts in one bulk request that changes data. */
export const BULK_BATCH_SIZE = 500

/** A preview changes nothing, so the API judges a larger selection as one set. */
export const BULK_PREVIEW_SIZE = 2000

/** Set by the app on items whose request failed part way through a run. */
export const NOT_PROCESSED = 'not_processed'

/** Refusals that another item of the same selection can clear once it has been handled. */
const WAITS_FOR_ANOTHER_ITEM = new Set(['territory_has_children', 'user_has_reports', 'parent_archived'])

export interface BulkProgress {
  done: number
  total: number
}

interface BatchOptions {
  dryRun?: boolean
  /** Only called when the selection needs more than one request. */
  onProgress?: (progress: BulkProgress) => void
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size))
  return result
}

function summarize(items: BulkItemResult[], dryRun: boolean): BulkResult {
  const count = (outcome: BulkItemResult['outcome']) => items.filter((i) => i.outcome === outcome).length
  return {
    deleted: count('deleted'),
    archived: count('archived'),
    restored: count('restored'),
    updated: count('updated'),
    blocked: count('blocked'),
    dryRun,
    items,
  }
}

/**
 * Sends a selection in requests the API accepts, one after the other, and returns one result for all
 * of them. A selection that fits in one request is sent as it is.
 *
 * Items refused only because a related item had not been handled yet (a parent in an earlier request
 * than its child) are sent again once the others are done. If a request fails after earlier ones went
 * through, the run stops and reports the rest as not processed, so nothing already done is hidden.
 */
export async function runInBatches(
  ids: readonly string[],
  send: (ids: string[]) => Promise<BulkResult>,
  { dryRun = false, onProgress }: BatchOptions = {},
): Promise<BulkResult> {
  const unique = [...new Set(ids)]
  const size = dryRun ? BULK_PREVIEW_SIZE : BULK_BATCH_SIZE
  if (unique.length <= size) return send(unique)

  const outcomes = new Map<string, BulkItemResult>()
  const finish = () =>
    summarize(
      unique.map((id) => outcomes.get(id) ?? { id, outcome: 'blocked', code: NOT_PROCESSED }),
      dryRun,
    )

  let done = 0
  onProgress?.({ done, total: unique.length })
  for (const batch of chunks(unique, size)) {
    try {
      const result = await send(batch)
      for (const item of result.items) outcomes.set(item.id, item)
    } catch (error) {
      if (dryRun || done === 0) throw error
      return finish()
    }
    done += batch.length
    onProgress?.({ done, total: unique.length })
  }
  if (dryRun) return finish()

  const waiting = () =>
    unique.filter((id) => {
      const item = outcomes.get(id)
      return item?.outcome === 'blocked' && WAITS_FOR_ANOTHER_ITEM.has(item.code ?? '')
    })

  let moved = [...outcomes.values()].some((item) => item.outcome !== 'blocked')
  let pending = waiting()
  while (moved && pending.length > 0) {
    moved = false
    for (const batch of chunks(pending, size)) {
      try {
        const result = await send(batch)
        for (const item of result.items) {
          outcomes.set(item.id, item)
          moved ||= item.outcome !== 'blocked'
        }
      } catch {
        // These items keep the reason they were refused for the first time.
        return finish()
      }
    }
    pending = waiting()
  }
  return finish()
}
