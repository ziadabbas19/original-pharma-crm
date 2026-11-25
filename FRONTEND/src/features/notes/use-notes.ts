import { useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotesList } from '@/api/generated/endpoints'
import type { NoteDto } from '@/api/generated/model'
import { locale } from '@/lib/format'
import { toast } from '@/lib/toast'
import { readCache, writeCache } from '@/lib/offline-cache'
import { platform, type ReminderNote } from '@/lib/platform'
import { useAppSelector } from '@/store'
import { onNoteReminder } from './live-reminders'
import { rememberNoteIds, useNoteOutbox } from './note-outbox'
import { applyQueued, sortNotes, type NoteView } from './note-queue'
import { formatReminder } from './note-time'

const CACHE_KEY = 'notes'

/**
 * The signed-in user's notes (open and done, at most 500) with their queued changes applied. The last
 * copy is kept on the device, so the list and the Home card open offline too.
 */
export function useNotes() {
  const copy = readCache<NoteDto[]>(CACHE_KEY)
  const query = useNotesList(
    { status: 'all' },
    {
      query: {
        initialData: copy?.data,
        initialDataUpdatedAt: copy?.savedAt,
        staleTime: 30_000,
        refetchOnMount: 'always',
        refetchInterval: 5 * 60_000,
      },
    },
  )
  useEffect(() => {
    if (query.data && query.isFetchedAfterMount && !query.isError) {
      writeCache(CACHE_KEY, query.data)
      rememberNoteIds(query.data)
    }
  }, [query.data, query.isFetchedAfterMount, query.isError])

  const outbox = useNoteOutbox()
  const userId = useAppSelector((s) => s.auth.user?.id)
  const notes = useMemo<NoteView[]>(
    () => sortNotes(applyQueued(query.data ?? [], outbox, userId)),
    [query.data, outbox, userId],
  )
  return { notes, query, queued: outbox.length }
}

/** Title and text of a reminder in the reader's language: the note's title (or "Reminder") and its start. */
export function reminderText(note: ReminderNote, t: TFunction): { title: string; body: string } {
  const title = note.title?.trim() || t('notes.reminder')
  const excerpt = note.body.trim().slice(0, 120)
  const when = note.remindAt ? formatReminder(note.remindAt, locale()) : ''
  return { title, body: [excerpt, when].filter(Boolean).join(' · ') }
}

/** The notes screen of the shell the user is in. */
export type NotesShell = 'rep' | 'admin'

/**
 * Both shells: keep the phone's own reminder notifications in step with the notes (after sign-in, at start,
 * after every sync), open the note when one is tapped, and show reminders that arrive while the app is open.
 */
export function useNoteReminders(shell: NotesShell) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { notes, query } = useNotes()
  const ready = query.data !== undefined

  useEffect(() => {
    if (!ready || !platform().reminders.supported) return
    void platform()
      .reminders.sync(notes, (n) => reminderText(n, t), t('notes.channelName'))
      .catch(() => {})
  }, [ready, notes, t, i18n.resolvedLanguage])

  useEffect(() => {
    const openNote = (noteId: string) =>
      void navigate(
        shell === 'admin'
          ? { to: '/admin/notes', search: { note: noteId } }
          : { to: '/rep/notes', search: { note: noteId } },
      )
    const stopTaps = platform().reminders.onOpen(openNote)
    const stopLive = onNoteReminder((n) => {
      const data = (n.data ?? {}) as { title?: string | null }
      toast.show({
        tone: 'info',
        message: t('notes.liveToast', { title: data.title?.trim() || t('notes.reminder') }),
        action: n.entityId ? { label: t('common.open'), onClick: () => openNote(n.entityId!) } : undefined,
      })
    })
    return () => {
      stopTaps()
      stopLive()
    }
  }, [navigate, shell, t])
}
