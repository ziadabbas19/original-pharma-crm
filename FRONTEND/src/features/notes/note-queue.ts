import type { NoteDto } from '@/api/generated/model'
import { notifyAtOf } from './note-time.ts'

/**
 * The rules of the notes outbox, kept free of app wiring. Every change made on the phone is queued
 * (offline or not) and shown at once on top of the last copy from the server. A note is known by its
 * clientRequestId until the server has given it an id, so changes to a note written offline still
 * reach the right note.
 */

/** A note's text and reminder as the sheet edits them. */
export interface NoteFields {
  title: string | null
  body: string
  remindAt: string | null
  remindBeforeMinutes: number | null
}

export type NoteChange =
  | ({ type: 'create'; key: string; userId: string; at: string } & NoteFields)
  | ({ type: 'update'; key: string; userId: string; at: string } & NoteFields)
  | { type: 'delete'; key: string; userId: string; at: string }
  | { type: 'done'; key: string; userId: string; at: string }
  | { type: 'reopen'; key: string; userId: string; at: string }
  /** `until`: the instant chosen on the phone; the minutes are worked out when it is sent. */
  | { type: 'snooze'; key: string; userId: string; at: string; until: string }

export type NoteView = NoteDto & { queued?: boolean }

/** The key changes use for a note: its clientRequestId (known from the moment it was written). */
export function noteKey(note: Pick<NoteDto, 'clientRequestId'>): string {
  return note.clientRequestId
}

function sameInstant(a: string | null, b: string | null): boolean {
  return a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime())
}

function withFields(note: NoteView, fields: NoteFields, at: string): NoteView {
  const changedReminder =
    !sameInstant(fields.remindAt, note.remindAt) ||
    (fields.remindAt ? (fields.remindBeforeMinutes ?? 0) : null) !== note.remindBeforeMinutes
  return {
    ...note,
    title: fields.title?.trim() || null,
    body: fields.body.trim(),
    remindAt: fields.remindAt,
    remindBeforeMinutes: fields.remindAt ? Math.max(0, fields.remindBeforeMinutes ?? 0) : null,
    notifyAt: notifyAtOf(fields.remindAt, fields.remindBeforeMinutes),
    notifiedAt: changedReminder ? null : note.notifiedAt,
    updatedAt: at,
    queued: true,
  }
}

/** The signed-in user's notes as they should see them: the server's copy with their queued changes applied in order. */
export function applyQueued(
  notes: readonly NoteDto[],
  changes: readonly NoteChange[],
  userId: string | undefined,
): NoteView[] {
  let list: NoteView[] = notes.map((n) => ({ ...n }))
  for (const change of changes) {
    if (change.userId !== userId) continue
    const index = list.findIndex((n) => noteKey(n) === change.key)
    switch (change.type) {
      case 'create':
        if (index < 0) {
          list.push(
            withFields(
              {
                id: change.key,
                clientRequestId: change.key,
                title: null,
                body: '',
                remindAt: null,
                remindBeforeMinutes: null,
                notifyAt: null,
                notifiedAt: null,
                doneAt: null,
                createdAt: change.at,
                updatedAt: change.at,
              },
              change,
              change.at,
            ),
          )
        }
        break
      case 'update':
        if (index >= 0) list[index] = withFields(list[index], change, change.at)
        break
      case 'delete':
        if (index >= 0) list = list.filter((_, i) => i !== index)
        break
      case 'done':
        if (index >= 0)
          list[index] = { ...list[index], doneAt: list[index].doneAt ?? change.at, queued: true }
        break
      case 'reopen':
        if (index >= 0) list[index] = { ...list[index], doneAt: null, notifiedAt: null, queued: true }
        break
      case 'snooze':
        if (index >= 0)
          list[index] = {
            ...list[index],
            remindAt: change.until,
            remindBeforeMinutes: 0,
            notifyAt: change.until,
            notifiedAt: null,
            queued: true,
          }
        break
    }
  }
  return list
}

/** Open first (next reminder first, then latest change), then done (latest first): the server's order. */
export function sortNotes<T extends NoteDto>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1
    if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt)
    if (!a.notifyAt !== !b.notifyAt) return a.notifyAt ? -1 : 1
    if (a.notifyAt && b.notifyAt && a.notifyAt !== b.notifyAt) return a.notifyAt.localeCompare(b.notifyAt)
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** Search as the server does it: in title and text, ignoring case. */
export function matchesSearch(note: Pick<NoteDto, 'title' | 'body'>, search: string): boolean {
  const q = search.trim().toLowerCase()
  return !q || (note.title ?? '').toLowerCase().includes(q) || note.body.toLowerCase().includes(q)
}
