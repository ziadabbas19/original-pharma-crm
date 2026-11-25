import type { NotificationDto } from '@/api/generated/model'

/**
 * Note reminders that arrive over the live connection while the app is open. The connection hook hands
 * them over here; the shell shows them with a button that opens the note.
 */
const listeners = new Set<(notification: NotificationDto) => void>()

export function emitNoteReminder(notification: NotificationDto): void {
  listeners.forEach((listener) => listener(notification))
}

export function onNoteReminder(listener: (notification: NotificationDto) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
