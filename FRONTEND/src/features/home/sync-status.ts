import { pendingExpenseCount, syncExpenses, useExpenseOutbox } from '@/features/expenses/expense-outbox'
import { pendingNoteCount, syncNotes, useNoteOutbox } from '@/features/notes/note-outbox'
import { pendingOrderCount, syncOrders, useOrderOutbox } from '@/features/orders/order-outbox'
import { readVisitOutbox, syncVisits, useVisitOutbox } from '@/features/visits/visit-outbox'

/**
 * One place that asks every outbox on the device (orders, visit steps and content, expenses, notes) how
 * much is still waiting to be sent. Refused items are not counted: sending again would not help.
 */
export async function pendingSyncCount(): Promise<number> {
  const [orders, visits, expenses, notes] = await Promise.all([
    pendingOrderCount(),
    readVisitOutbox(),
    pendingExpenseCount(),
    pendingNoteCount(),
  ])
  return orders + visits.pending.length + visits.steps.length + expenses + notes
}

/** Sends every outbox now; resolves with what is still waiting afterwards. */
export async function flushAllOutboxes(): Promise<number> {
  await Promise.allSettled([syncVisits(), syncOrders(), syncExpenses(), syncNotes()])
  return pendingSyncCount()
}

/** The same count, kept up to date while the screen is open. */
export function usePendingSyncCount(): number {
  const orders = useOrderOutbox()
  const visits = useVisitOutbox()
  const expenses = useExpenseOutbox()
  const notes = useNoteOutbox()
  return orders.pending.length + visits.pending.length + visits.steps.length + expenses.length + notes.length
}

export type SyncChipState = { kind: 'offline'; waiting: number } | { kind: 'waiting'; waiting: number } | null

/** What the chip on Home shows: offline, how many items wait, or nothing when everything is sent. */
export function syncChipState(online: boolean, waiting: number): SyncChipState {
  if (!online) return { kind: 'offline', waiting }
  return waiting > 0 ? { kind: 'waiting', waiting } : null
}
