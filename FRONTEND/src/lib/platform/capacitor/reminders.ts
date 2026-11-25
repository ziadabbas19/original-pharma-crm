import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  REMINDER_CHANNEL_ID,
  noteIdOfNotification,
  plannedReminders,
  syncScheduledReminders,
  type ReminderPlugin,
} from '@/features/notes/local-reminders'
import type { LocalReminders, PermissionState, ReminderNote } from '../types'

/**
 * Note reminders through @capacitor/local-notifications: one notification per open note at its notify
 * time, on the "Reminders" channel, exact when Android allows exact alarms (otherwise a little late,
 * and the notes screen says so). Nothing here ever asks for a permission except requestPermission().
 */
export class CapacitorLocalReminders implements LocalReminders {
  readonly supported = Capacitor.isNativePlatform()
  private readonly handlers = new Set<(noteId: string) => void>()
  /** A tap that started the app before any screen listened. */
  private waiting: string | null = null
  private channelName: string | null = null

  constructor() {
    if (!this.supported) return
    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const noteId = noteIdOfNotification(action.notification.extra)
      if (!noteId) return
      if (this.handlers.size === 0) this.waiting = noteId
      else this.handlers.forEach((handler) => handler(noteId))
    })
  }

  async permission(): Promise<PermissionState> {
    if (!this.supported) return 'notRequired'
    return toState((await LocalNotifications.checkPermissions()).display)
  }

  async requestPermission(): Promise<PermissionState> {
    if (!this.supported) return 'notRequired'
    return toState((await LocalNotifications.requestPermissions()).display)
  }

  async exactAllowed(): Promise<boolean | null> {
    if (!this.supported) return null
    try {
      return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'
    } catch {
      return null // Before Android 12 every alarm may be exact.
    }
  }

  async openExactAlarmSettings(): Promise<void> {
    if (this.supported) await LocalNotifications.changeExactNotificationSetting()
  }

  async sync(
    notes: readonly ReminderNote[],
    text: (note: ReminderNote) => { title: string; body: string },
    channelName: string,
  ): Promise<void> {
    if (!this.supported || (await this.permission()) !== 'granted') return
    if (this.channelName !== channelName) {
      // Creating it again with the same id renames it when the language changed.
      await LocalNotifications.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: channelName,
        importance: 4,
        visibility: 0,
        vibration: true,
      })
      this.channelName = channelName
    }
    // Without exact alarms the plugin would open the system setting on every schedule: ask for inexact ones instead.
    const exact = (await this.exactAllowed()) !== false
    await syncScheduledReminders(
      LocalNotifications as unknown as ReminderPlugin,
      plannedReminders(notes, text, { exact }),
    )
  }

  onOpen(handler: (noteId: string) => void): () => void {
    this.handlers.add(handler)
    if (this.waiting) {
      const noteId = this.waiting
      this.waiting = null
      handler(noteId)
    }
    return () => this.handlers.delete(handler)
  }

  async clear(): Promise<void> {
    if (!this.supported || (await this.permission()) !== 'granted') return
    await syncScheduledReminders(LocalNotifications as unknown as ReminderPlugin, [])
  }
}

function toState(display: string): PermissionState {
  if (display === 'granted') return 'granted'
  if (display === 'denied') return 'denied'
  return 'prompt'
}
