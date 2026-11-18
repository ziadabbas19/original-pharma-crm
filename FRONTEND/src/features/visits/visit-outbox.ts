import { useEffect, useState } from 'react'
import { getVisitsGetQueryKey, visitsUpdateContent } from '@/api/generated/endpoints'
import type { UpdateVisitContentRequest, VisitDetailDto } from '@/api/generated/model'
import { queryClient } from '@/app/query-client'
import { ApiError } from '@/lib/api-client'
import { invalidateApi } from '@/lib/invalidate-api'
import { platform, type QueuedItem } from '@/lib/platform'
import { store } from '@/store'

/**
 * Visit feedback and products go through the device outbox like orders, online or not. Each entry is
 * the whole content of the visit with the device time of the edit (clientUpdatedAt): the server ignores
 * anything older than what it already applied, so retries and late deliveries are safe.
 */

const PENDING = 'visit-content'
const FAILED = 'visit-content-failed'

export interface QueuedVisitContent {
  userId: string
  visitId: string
  /** Shown in the list while waiting. */
  customerName: string
  request: UpdateVisitContentRequest
  queuedAt: string
}

export interface FailedVisitContent extends QueuedVisitContent {
  error: { status: number; code: string; title?: string }
}

export interface VisitOutboxState {
  pending: QueuedItem<QueuedVisitContent>[]
  failed: QueuedItem<FailedVisitContent>[]
}

const listeners = new Set<() => void>()
let syncing: Promise<void> | null = null

const notify = () => listeners.forEach((listener) => listener())
const currentUserId = () => store.getState().auth.user?.id

/** Saves the content on the device (replacing an earlier unsent edit of the same visit) and tries to send it. */
export async function queueVisitContent(
  visitId: string,
  customerName: string,
  request: UpdateVisitContentRequest,
): Promise<void> {
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')
  const db = platform().offlineDb
  const [pending, failed] = await Promise.all([
    db.peek<QueuedVisitContent>(PENDING, 200),
    db.peek<FailedVisitContent>(FAILED, 200),
  ])
  const older = [...pending, ...failed].filter((i) => i.payload.visitId === visitId).map((i) => i.id)
  if (older.length > 0) await db.remove(older)
  await db.enqueue(PENDING, { userId, visitId, customerName, request, queuedAt: new Date().toISOString() })
  notify()
  await syncVisitContent()
}

export async function discardVisitContent(id: number): Promise<void> {
  await platform().offlineDb.remove([id])
  notify()
}

function isPermanent(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
  )
}

/** Sends the queued content of the signed-in user, oldest first. Single-flight. */
export function syncVisitContent(): Promise<void> {
  syncing ??= (async () => {
    const userId = currentUserId()
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    const db = platform().offlineDb
    const items = (await db.peek<QueuedVisitContent>(PENDING, 50)).filter((i) => i.payload.userId === userId)
    for (const item of items) {
      try {
        const visit: VisitDetailDto = await visitsUpdateContent(item.payload.visitId, item.payload.request)
        await db.remove([item.id])
        queryClient.setQueryData(getVisitsGetQueryKey(item.payload.visitId), visit)
      } catch (error) {
        if (!isPermanent(error)) break // offline or server trouble: keep the rest for later
        const failed: FailedVisitContent = {
          ...item.payload,
          error: { status: error.status, code: error.code, title: error.problem.title },
        }
        await db.enqueue(FAILED, failed)
        await db.remove([item.id])
      }
      notify()
    }
    if (items.length > 0) await invalidateApi(queryClient, '/api/visits')
  })().finally(() => {
    syncing = null
    notify()
  })
  return syncing
}

async function readState(): Promise<VisitOutboxState> {
  const userId = currentUserId()
  const db = platform().offlineDb
  const [pending, failed] = await Promise.all([
    db.peek<QueuedVisitContent>(PENDING, 200),
    db.peek<FailedVisitContent>(FAILED, 200),
  ])
  return {
    pending: pending.filter((i) => i.payload.userId === userId),
    failed: failed.filter((i) => i.payload.userId === userId),
  }
}

export function useVisitOutbox(): VisitOutboxState {
  const [state, setState] = useState<VisitOutboxState>({ pending: [], failed: [] })
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

/** Retries when the device comes back online, on return to the app, and every minute. */
export function startVisitSync(): () => void {
  const run = () => void syncVisitContent().catch(() => {})
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
