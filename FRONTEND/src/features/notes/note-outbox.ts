import { useEffect, useState } from 'react'
import {
  notesCreate,
  notesDelete,
  notesDone,
  notesList,
  notesReopen,
  notesSnooze,
  notesUpdate,
} from '@/api/generated/endpoints'
import { queryClient } from '@/app/query-client'
import { isPermanentRefusal } from '@/features/expenses/expense-queue'
import { handleError, normalizeError } from '@/lib/errors'
import { invalidateApi } from '@/lib/invalidate-api'
import { platform } from '@/lib/platform'
import { store } from '@/store'
import type { NoteChange } from './note-queue'
import { snoozeMinutesFor } from './note-time'

/**
 * The user's note changes go through the device outbox like expenses: shown at once, sent in order when
 * there is network, retried after a lost connection. A note written offline is created with its
 * clientRequestId, so sending it twice stores it once. Sent changes leave the outbox only after the
 * list has been fetched again, so the screen never falls back to the old copy in between.
 */

const KIND = 'note-change'

type NewChange = NoteChange extends infer C
  ? C extends NoteChange
    ? Omit<C, 'userId' | 'at'>
    : never
  : never

const listeners = new Set<() => void>()
let syncing: Promise<void> | null = null
/** Server ids of notes by clientRequestId, learned from answers (notes written offline get theirs on create). */
const serverIds = new Map<string, string>()

function notify() {
  listeners.forEach((listener) => listener())
}

function currentUserId(): string | undefined {
  return store.getState().auth.user?.id
}

/** Remembers server ids seen in a list, for changes queued against notes the phone knows by key. */
export function rememberNoteIds(notes: readonly { id: string; clientRequestId: string }[]): void {
  for (const n of notes) serverIds.set(n.clientRequestId, n.id)
}

export async function queueNoteChange(change: NewChange): Promise<void> {
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')
  const item = { ...change, userId, at: new Date().toISOString() } as NoteChange
  await platform().offlineDb.enqueue(KIND, item)
  notify()
  void syncNotes()
}

/** The server id of the note a change is about, or null when the note is gone. */
async function idFor(key: string): Promise<string | null> {
  const known = serverIds.get(key)
  if (known) return known
  rememberNoteIds(await notesList({ status: 'all' }))
  return serverIds.get(key) ?? null
}

async function send(change: NoteChange): Promise<void> {
  if (change.type === 'create') {
    const saved = await notesCreate({
      clientRequestId: change.key,
      title: change.title,
      body: change.body,
      remindAt: change.remindAt,
      remindBeforeMinutes: change.remindAt ? change.remindBeforeMinutes : null,
    })
    serverIds.set(change.key, saved.id)
    return
  }

  const id = await idFor(change.key)
  if (!id) return // Deleted elsewhere: nothing left to change.
  try {
    switch (change.type) {
      case 'update':
        await notesUpdate(id, {
          title: change.title,
          body: change.body,
          remindAt: change.remindAt,
          remindBeforeMinutes: change.remindAt ? change.remindBeforeMinutes : null,
        })
        return
      case 'delete':
        await notesDelete(id)
        serverIds.delete(change.key)
        return
      case 'done':
        await notesDone(id)
        return
      case 'reopen':
        await notesReopen(id)
        return
      case 'snooze':
        await notesSnooze(id, { minutes: snoozeMinutesFor(change.until) })
        return
    }
  } catch (error) {
    // Gone already (deleted on another device): what this change wanted no longer matters.
    if (normalizeError(error).kind !== 'notFound') throw error
  }
}

/** Sends the signed-in user's queued note changes, oldest first. Stops at the first one that may work later. */
export function syncNotes(): Promise<void> {
  syncing ??= (async () => {
    const userId = currentUserId()
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    const db = platform().offlineDb
    const sent: number[] = []
    try {
      for (const item of await db.peek<NoteChange>(KIND, 200)) {
        if (item.payload.userId !== userId) continue
        try {
          await send(item.payload)
        } catch (error) {
          const failure = normalizeError(error)
          if (failure.status === null || !isPermanentRefusal(failure.status)) break // offline or server trouble
          handleError(failure, { context: 'notes.sync' })
        }
        sent.push(item.id)
      }
    } finally {
      if (sent.length > 0) {
        await invalidateApi(queryClient, '/api/notes', '/api/notifications').catch(() => {})
        await db.remove(sent)
      }
    }
  })().finally(() => {
    syncing = null
    notify()
  })
  return syncing
}

async function readPending(): Promise<NoteChange[]> {
  const userId = currentUserId()
  const items = await platform().offlineDb.peek<NoteChange>(KIND, 200)
  return items.map((i) => i.payload).filter((c) => c.userId === userId)
}

/** The signed-in user's note changes still waiting on this device, oldest first. */
export function useNoteOutbox(): NoteChange[] {
  const [pending, setPending] = useState<NoteChange[]>([])
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
export function startNoteSync(): () => void {
  const run = () => void syncNotes().catch(() => {})
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
