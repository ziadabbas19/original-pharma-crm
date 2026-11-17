import { useEffect, useState } from 'react'
import { getOrdersGetQueryKey, ordersCreate } from '@/api/generated/endpoints'
import type { CreateOrderRequest, OrderDto } from '@/api/generated/model'
import { queryClient } from '@/app/query-client'
import { ApiError } from '@/lib/api-client'
import { platform, type QueuedItem } from '@/lib/platform'
import { store } from '@/store'

/**
 * Orders go through the device outbox (IndexedDB in the browser, SQLite in the Android app),
 * online or not. Each carries a client-generated idempotency key (clientRequestId), so a retry
 * after a lost response returns the order that already exists instead of creating a second one.
 */

const PENDING = 'order'
const FAILED = 'order-failed'

export interface QueuedOrder {
  /** Only the user who took the order sends it (another user may sign in on the same device). */
  userId: string
  request: CreateOrderRequest
  /** Estimate for the list while the order waits; the server computes the real totals. */
  estimatedTotal: number
  queuedAt: string
}

export interface FailedOrder extends QueuedOrder {
  error: { status: number; code: string; title?: string; maxDiscountPercent?: number }
  failedAt: string
}

export interface OutboxState {
  pending: QueuedItem<QueuedOrder>[]
  failed: QueuedItem<FailedOrder>[]
  syncing: boolean
}

const listeners = new Set<() => void>()
let syncing: Promise<{ sent: number; failed: number }> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

function currentUserId(): string | undefined {
  return store.getState().auth.user?.id
}

export async function queueOrder(request: CreateOrderRequest, estimatedTotal: number): Promise<void> {
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')
  const item: QueuedOrder = { userId, request, estimatedTotal, queuedAt: new Date().toISOString() }
  await platform().offlineDb.enqueue(PENDING, item)
  notify()
  void syncOrders()
}

export async function discardFailedOrder(id: number): Promise<void> {
  await platform().offlineDb.remove([id])
  notify()
}

/** Errors that will not go away by retrying: move the order to "needs attention". */
function isPermanent(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
  )
}

/** Sends the queued orders of the signed-in user, oldest first. Single-flight. */
export function syncOrders(): Promise<{ sent: number; failed: number }> {
  syncing ??= (async () => {
    const userId = currentUserId()
    let sent = 0
    let failed = 0
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent, failed }
    notify()
    try {
      const db = platform().offlineDb
      const items = (await db.peek<QueuedOrder>(PENDING, 50)).filter((item) => item.payload.userId === userId)
      for (const item of items) {
        try {
          const order: OrderDto = await ordersCreate(item.payload.request)
          await db.remove([item.id])
          queryClient.setQueryData(getOrdersGetQueryKey(order.id), order)
          sent++
        } catch (error) {
          if (!isPermanent(error)) break // offline or server trouble: keep the rest for later
          const problem = error.problem
          const failedOrder: FailedOrder = {
            ...item.payload,
            error: {
              status: error.status,
              code: error.code,
              title: problem.title,
              maxDiscountPercent:
                typeof problem.maxDiscountPercent === 'number' ? problem.maxDiscountPercent : undefined,
            },
            failedAt: new Date().toISOString(),
          }
          await db.enqueue(FAILED, failedOrder)
          await db.remove([item.id])
          failed++
        }
        notify()
      }
    } finally {
      if (sent > 0) void queryClient.invalidateQueries({ queryKey: ['/api/orders'] })
    }
    return { sent, failed }
  })().finally(() => {
    syncing = null
    notify()
  })
  return syncing
}

async function readState(): Promise<OutboxState> {
  const userId = currentUserId()
  const db = platform().offlineDb
  const [pending, failed] = await Promise.all([
    db.peek<QueuedOrder>(PENDING, 200),
    db.peek<FailedOrder>(FAILED, 200),
  ])
  return {
    pending: pending.filter((i) => i.payload.userId === userId),
    failed: failed.filter((i) => i.payload.userId === userId),
    syncing: syncing !== null,
  }
}

/** Pending and failed orders of the signed-in user, kept up to date. */
export function useOrderOutbox(): OutboxState {
  const [state, setState] = useState<OutboxState>({ pending: [], failed: [], syncing: false })
  useEffect(() => {
    let active = true
    const update = () =>
      void readState()
        .then((next) => active && setState(next))
        .catch(() => {})
    update()
    listeners.add(update)
    return () => {
      active = false
      listeners.delete(update)
    }
  }, [])
  return state
}

/** Retries when the device comes back online, when the app returns to the foreground, and every minute. */
export function startOrderSync(): () => void {
  const run = () => void syncOrders().catch(() => {})
  window.addEventListener('online', run)
  const stopResume = platform().app.onResume(run)
  const timer = window.setInterval(run, 60_000)
  run()
  return () => {
    window.removeEventListener('online', run)
    stopResume()
    window.clearInterval(timer)
  }
}
