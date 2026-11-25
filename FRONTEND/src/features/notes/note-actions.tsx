import { AlarmClockIcon, CheckIcon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NoteView } from './note-queue'
import type { SnoozeChoice } from './note-time'
import { useNoteActions } from './use-note-actions'

const SNOOZE_CHOICES: SnoozeChoice[] = ['10m', '1h', 'tomorrow']

/** Done (or Reopen) and Snooze for one note; Snooze opens its three choices in place. */
export function NoteQuickActions({ note, className }: { note: NoteView; className?: string }) {
  const { t } = useTranslation()
  const actions = useNoteActions()
  const [snoozing, setSnoozing] = useState(false)

  if (note.doneAt) {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void actions.reopen(note)}
          data-testid="note-reopen"
        >
          <RotateCcwIcon />
          {t('notes.reopen')}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button size="sm" variant="success" onClick={() => void actions.done(note)} data-testid="note-done">
        <CheckIcon />
        {t('notes.markDone')}
      </Button>
      {note.remindAt && !snoozing && (
        <Button size="sm" variant="outline" onClick={() => setSnoozing(true)} data-testid="note-snooze">
          <AlarmClockIcon />
          {t('notes.snooze')}
        </Button>
      )}
      {snoozing &&
        SNOOZE_CHOICES.map((choice) => (
          <Button
            key={choice}
            size="sm"
            variant="soft"
            onClick={() => {
              setSnoozing(false)
              void actions.snooze(note, choice)
            }}
            data-testid={`snooze-${choice}`}
          >
            {t(`notes.snoozeOptions.${choice}`)}
          </Button>
        ))}
    </div>
  )
}
