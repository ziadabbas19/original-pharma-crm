import { useTranslation } from 'react-i18next'
import { handleError } from '@/lib/errors'
import { locale } from '@/lib/format'
import { toast } from '@/lib/toast'
import { queueNoteChange } from './note-outbox'
import { noteKey, type NoteView } from './note-queue'
import { formatReminder, snoozeUntil, type SnoozeChoice } from './note-time'

/** Done, reopen and snooze, queued through the outbox (they work offline). */
export function useNoteActions() {
  const { t } = useTranslation()
  const run = async (work: () => Promise<void>, context: string, message?: string) => {
    try {
      await work()
      if (message) toast.show({ tone: 'success', message })
    } catch (error) {
      handleError(error, { context })
    }
  }
  return {
    done: (note: NoteView) =>
      run(() => queueNoteChange({ type: 'done', key: noteKey(note) }), 'notes.done', t('notes.markedDone')),
    reopen: (note: NoteView) =>
      run(() => queueNoteChange({ type: 'reopen', key: noteKey(note) }), 'notes.reopen'),
    snooze: (note: NoteView, choice: SnoozeChoice) => {
      const until = snoozeUntil(choice)
      return run(
        () => queueNoteChange({ type: 'snooze', key: noteKey(note), until }),
        'notes.snooze',
        t('notes.snoozed', { time: formatReminder(until, locale()) }),
      )
    },
  }
}
