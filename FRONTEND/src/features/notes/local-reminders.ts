import type { NoteDto } from '@/api/generated/model'
import { notifyAtOf } from './note-time.ts'

/**
 * Phone notifications for note reminders while the app is closed (Android, through the local
 * notifications plugin). The phone schedules one notification per open note whose reminder is still to
 * come; every sync compares what is scheduled with what should be and only changes the difference.
 * The plugin is passed in, so this runs (and is tested) without a phone.
 */

export const REMINDER_CHANNEL_ID = 'reminders'

/** Marks the notifications this module owns, so others on the device are never touched. */
export const REMINDER_KIND = 'note-reminder'

/** Android keeps at most 500 alarms per app (the tracking plugin needs some): the nearest ones are scheduled. */
export const MAX_SCHEDULED = 50

/** The subset of the plugin this module calls. */
export interface ReminderPlugin {
  getPending(): Promise<{
    notifications: {
      id: number
      title?: string
      body?: string
      schedule?: { at?: Date | string }
      extra?: unknown
    }[]
  }>
  schedule(options: { notifications: ScheduledReminder[] }): Promise<unknown>
  cancel(options: { notifications: { id: number }[] }): Promise<void>
}

export interface ScheduledReminder {
  id: number
  title: string
  body: string
  channelId: string
  schedule: { at: Date; allowWhileIdle: boolean }
  /** False when the phone does not allow exact alarms: Android then fires it a little late instead. */
  isExactNotification: boolean
  extra: { kind: typeof REMINDER_KIND; noteId: string }
}

/**
 * A stable notification id for a note (FNV-1a over the note id): a positive 31-bit integer, never 0, so it
 * fits Android's int and the same note always replaces or cancels its own notification.
 */
export function reminderNotificationId(noteId: string): number {
  let hash = 0x811c9dc5
  const text = noteId.toLowerCase()
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash & 0x7fffffff || 1
}

type ReminderNote = Pick<
  NoteDto,
  'id' | 'title' | 'body' | 'remindAt' | 'remindBeforeMinutes' | 'notifyAt' | 'doneAt'
>

/** What should be scheduled now: open notes whose notify time is still ahead, nearest first. */
export function plannedReminders(
  notes: readonly ReminderNote[],
  text: (note: ReminderNote) => { title: string; body: string },
  options: { now?: number; exact: boolean },
): ScheduledReminder[] {
  const now = options.now ?? Date.now()
  return notes
    .filter((n) => !n.doneAt && n.remindAt)
    .map((n) => ({ note: n, at: new Date(n.notifyAt ?? notifyAtOf(n.remindAt, n.remindBeforeMinutes)!) }))
    .filter((x) => x.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED)
    .map(({ note, at }) => ({
      id: reminderNotificationId(note.id),
      ...text(note),
      channelId: REMINDER_CHANNEL_ID,
      schedule: { at, allowWhileIdle: true },
      isExactNotification: options.exact,
      extra: { kind: REMINDER_KIND, noteId: note.id },
    }))
}

function isOurs(extra: unknown): boolean {
  return typeof extra === 'object' && extra !== null && (extra as { kind?: unknown }).kind === REMINDER_KIND
}

/**
 * Brings the phone's scheduled reminders in line with `planned`: cancels ours that are no longer wanted
 * or have changed (time or text), schedules the missing ones. Returns what changed.
 */
export async function syncScheduledReminders(
  plugin: ReminderPlugin,
  planned: readonly ScheduledReminder[],
): Promise<{ scheduled: number[]; cancelled: number[] }> {
  const pending = (await plugin.getPending()).notifications.filter((n) => isOurs(n.extra))
  const wanted = new Map(planned.map((p) => [p.id, p]))
  const keep = new Set<number>()
  const cancelled: number[] = []
  for (const n of pending) {
    const want = wanted.get(n.id)
    const at = n.schedule?.at ? new Date(n.schedule.at).getTime() : NaN
    if (want && at === want.schedule.at.getTime() && n.title === want.title && n.body === want.body) {
      keep.add(n.id)
    } else {
      cancelled.push(n.id)
    }
  }
  if (cancelled.length > 0) await plugin.cancel({ notifications: cancelled.map((id) => ({ id })) })
  const toSchedule = planned.filter((p) => !keep.has(p.id))
  if (toSchedule.length > 0) await plugin.schedule({ notifications: toSchedule })
  return { scheduled: toSchedule.map((p) => p.id), cancelled }
}

/** The note a tapped notification belongs to, or null for notifications that are not ours. */
export function noteIdOfNotification(extra: unknown): string | null {
  if (!isOurs(extra)) return null
  const id = (extra as { noteId?: unknown }).noteId
  return typeof id === 'string' && id ? id : null
}
