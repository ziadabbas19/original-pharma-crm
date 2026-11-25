import { Link } from '@tanstack/react-router'
import { AlarmClockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { locale } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NoteQuickActions } from './note-actions'
import { homeReminders, formatReminder, reminderState } from './note-time'
import { useNotes } from './use-notes'
import { useNow } from './use-now'

/** Rep Home: due and overdue reminders (highlighted) and the next three, with Done and Snooze. */
export function RemindersHomeCard() {
  const { t } = useTranslation()
  const { notes, query } = useNotes()
  const now = useNow()
  if (query.data === undefined && query.isError) return null
  const { late, upcoming } = homeReminders(notes, now)
  const rows = [...late, ...upcoming]

  return (
    <Card className="gap-2 py-4" data-testid="home-reminders">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <AlarmClockIcon className="size-[18px] shrink-0 text-primary" aria-hidden />
          <span className="truncate">{t('notes.home.title')}</span>
        </CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link to="/rep/notes">{t('notes.home.all')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-5">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('notes.home.empty')}</p>
        ) : (
          <ul className="grid grid-cols-1 divide-y">
            {rows.map((note) => {
              const state = reminderState(note, now)
              const isLate = state === 'due' || state === 'overdue'
              return (
                <li
                  key={note.clientRequestId}
                  className={cn(
                    'grid min-w-0 grid-cols-1 gap-2 py-3',
                    isLate && '-mx-2 rounded-control bg-warning-soft/60 px-2',
                  )}
                  data-testid="home-reminder"
                  data-state={state}
                >
                  <Link to="/rep/notes" search={{ note: note.id }} className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold">
                        {note.title || note.body.split('\n')[0]}
                      </span>
                      {isLate && (
                        <Badge variant={state === 'overdue' ? 'destructive' : 'warning'} className="shrink-0">
                          {t(`notes.states.${state}`)}
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatReminder(note.remindAt!, locale())}
                    </span>
                  </Link>
                  <NoteQuickActions note={note} />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
