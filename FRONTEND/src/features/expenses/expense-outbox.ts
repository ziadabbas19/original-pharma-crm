import { useEffect, useState } from 'react'
import {
  expensesCreateLine,
  expensesRemoveLine,
  expensesSetDayNote,
  expensesUpdateLine,
} from '@/api/generated/endpoints'
import { queryClient } from '@/app/query-client'
import { handleError, normalizeError } from '@/lib/errors'
import { invalidateApi } from '@/lib/invalidate-api'
import { platform } from '@/lib/platform'
import { store } from '@/store'
import { isPermanentRefusal, type ExpenseChange } from './expense-queue'

/**
 * The rep's own expense changes go through the device outbox like visits and orders: shown at once,
 * sent in order when there is network, retried after a lost connection. Each change carries the time
 * it was made, so the server keeps the latest change of every line and field. A change the server
 * refuses for good (a day that can no longer be changed) is dropped with a message.
 */

const KIND = 'expense-change'

type NewChange = ExpenseChange extends infer C
  ? C extends ExpenseChange
    ? Omit<C, 'userId' | 'changedAt'>
    : never
  : never

const listeners = new Set<() => void>()
let syncing: Promise<void> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

function currentUserId(): string | undefined {
  return store.getState().auth.user?.id
}

export async function queueExpenseChange(change: NewChange): Promise<void> {
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')
  const item = { ...change, userId, changedAt: new Date().toISOString() } as ExpenseChange
  await platform().offlineDb.enqueue(KIND, item)
  notify()
  void syncExpenses()
}

async function send(change: ExpenseChange): Promise<void> {
  switch (change.type) {
    case 'create':
      await expensesCreateLine({
        id: change.lineId,
        day: change.day,
        cityId: change.cityId,
        amount: change.amount,
        note: change.note,
        changedAt: change.changedAt,
      })
      return
    case 'update':
      await expensesUpdateLine(change.lineId, {
        amount: change.amount,
        note: change.note,
        changedAt: change.changedAt,
      })
      return
    case 'remove':
      try {
        await expensesRemoveLine(change.lineId)
      } catch (error) {
        // Gone already (removed elsewhere): what this change wanted has happened.
        if (normalizeError(error).kind !== 'notFound') throw error
      }
      return
    case 'dayNote':
      await expensesSetDayNote(change.day, { note: change.note, changedAt: change.changedAt })
  }
}

/** Sends the signed-in rep's queued changes, oldest first. Stops at the first one that may work later. */
export function syncExpenses(): Promise<void> {
  syncing ??= (async () => {
    const userId = currentUserId()
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    const db = platform().offlineDb
    let changed = false
    try {
      for (const item of await db.peek<ExpenseChange>(KIND, 200)) {
        if (item.payload.userId !== userId) continue
        try {
          await send(item.payload)
        } catch (error) {
          const failure = normalizeError(error)
          if (failure.status === null || !isPermanentRefusal(failure.status)) break // offline or server trouble
          handleError(failure, { context: 'expenses.sync' })
        }
        await db.remove([item.id])
        changed = true
        notify()
      }
    } finally {
      if (changed) await invalidateApi(queryClient, '/api/expenses')
    }
  })().finally(() => {
    syncing = null
    notify()
  })
  return syncing
}

async function readPending(): Promise<ExpenseChange[]> {
  const userId = currentUserId()
  const items = await platform().offlineDb.peek<ExpenseChange>(KIND, 200)
  return items.map((i) => i.payload).filter((c) => c.userId === userId)
}

/** How many of the signed-in rep's changes are still waiting on this device. */
export async function pendingExpenseCount(): Promise<number> {
  return (await readPending()).length
}

/** The signed-in rep's changes still waiting on this device, oldest first. */
export function useExpenseOutbox(): ExpenseChange[] {
  const [pending, setPending] = useState<ExpenseChange[]>([])
  useEffect(() => {
    let active = true
    const update = () =>
      void readPending()
        .then((next) => active && setPending(next))
        .catch(() => {})
    update()
    listeners.add(update)
    return () => {
      active = false
      listeners.delete(update)
    }
  }, [])
  return pending
}

/** Retries when the device comes back online, when the app returns to the foreground, and every minute. */
export function startExpenseSync(): () => void {
  const run = () => void syncExpenses().catch(() => {})
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
