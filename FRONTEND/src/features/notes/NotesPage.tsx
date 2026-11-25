import { useNavigate } from '@tanstack/react-router'
import { AlarmClockIcon, CloudOffIcon, NotebookPenIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/bulk/ConfirmDialog'
import { SearchInput } from '@/components/data-table/toolbar'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { locale } from '@/lib/format'
import { platform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { NoteQuickActions } from './note-actions'
import { queueNoteChange } from './note-outbox'
import { matchesSearch, noteKey, type NoteView } from './note-queue'
import { formatReminder, reminderState, type ReminderState } from './note-time'
import { NoteSheet } from './NoteSheet'
import type { NotesShell } from './use-notes'
import { useNotes } from './use-notes'
import { useNow } from './use-now'

type Tab = 'open' | 'done'

const STATE_BADGE: Partial<Record<ReminderState, 'default' | 'warning' | 'destructive'>> = {
  upcoming: 'default',
  due: 'warning',
  overdue: 'destructive',
}

/** The signed-in user's private notes: open and done tabs, search, write, change, done, snooze, delete. */
export function NotesPage({ shell, openNoteId }: { shell: NotesShell; openNoteId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { notes, query, queued } = useNotes()
  const now = useNow()
  const [tab, setTab] = useState<Tab>('open')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<NoteView | 'new' | null>(null)
  const [deleting, setDeleting] = useState<NoteView | null>(null)
  const [exactAllowed, setExactAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    void platform()
      .reminders.exactAllowed()
      .then(setExactAllowed)
      .catch(() => {})
    return platform().app.onResume(() => void platform().reminders.exactAllowed().then(setExactAllowed))
  }, [])

  // Opened from a reminder (in-app notification, the phone's notification or the Home card): open that
  // note once the list is there, then drop the link from the address.
  const [handledLink, setHandledLink] = useState<string | undefined>()
  if (openNoteId && openNoteId !== handledLink && query.data !== undefined) {
    setHandledLink(openNoteId)
    const target = notes.find((n) => n.id === openNoteId || n.clientRequestId === openNoteId)
    if (target) {
      setTab(target.doneAt ? 'done' : 'open')
      setEditing(target)
    }
  }
  useEffect(() => {
    if (openNoteId && openNoteId === handledLink) {
      void navigate({ to: shell === 'admin' ? '/admin/notes' : '/rep/notes', search: {}, replace: true })
    }
  }, [openNoteId, handledLink, navigate, shell])

  const rows = useMemo(
    () => notes.filter((n) => (tab === 'done' ? !!n.doneAt : !n.doneAt) && matchesSearch(n, search)),
    [notes, tab, search],
  )
  const hasReminders = notes.some((n) => !n.doneAt && n.remindAt)

  return (
    <div className="space-y-4" data-testid="notes-page">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('notes.title')}</h1>
        <Button onClick={() => setEditing('new')} data-testid="note-new">
          <PlusIcon />
          {t('notes.new')}
        </Button>
      </div>

      {exactAllowed === false && hasReminders && (
        <Alert variant="info" data-testid="notes-exact-hint">
          <AlarmClockIcon />
          <AlertDescription>
            <p>{t('notes.exactHint')}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void platform().reminders.openExactAlarmSettings()}
            >
              {t('notes.allowExact')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-control bg-muted p-1" role="tablist">
        {(['open', 'done'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={cn(
              'min-h-10 rounded-[10px] text-sm font-medium text-muted-foreground transition-colors',
              tab === value && 'bg-card text-foreground shadow-card',
            )}
            onClick={() => setTab(value)}
            data-testid={`notes-tab-${value}`}
          >
            {t(`notes.tabs.${value}`)}
          </button>
        ))}
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('notes.searchPlaceholder')}
        className="sm:w-full"
      />

      {queued > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="notes-queued">
          <CloudOffIcon className="size-4" aria-hidden />
          {t('notes.waiting', { count: queued })}
        </p>
      )}

      {query.isLoading && notes.length === 0 ? (
        <LoadingState rows={3} />
      ) : query.error && query.data === undefined ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Card className="py-2">
          <EmptyState
            icon={NotebookPenIcon}
            title={
              search.trim() ? t('states.noMatches') : tab === 'done' ? t('notes.emptyDone') : t('notes.empty')
            }
            description={tab === 'open' && !search.trim() ? t('notes.emptyHint') : undefined}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3" data-testid="notes-list">
          {rows.map((note) => {
            const state = reminderState(note, now)
            return (
              <li key={note.clientRequestId} className="min-w-0">
                <Card
                  className={cn(
                    'gap-2 py-3',
                    state === 'due' && 'border-warning/60 bg-warning-soft/40',
                    state === 'overdue' && 'border-destructive/40 bg-destructive-soft/30',
                  )}
                  data-testid="note-item"
                  data-state={state}
                >
                  <CardContent className="grid min-w-0 grid-cols-1 gap-2 px-4">
                    <button
                      type="button"
                      className="grid min-w-0 gap-1 text-start"
                      onClick={() => setEditing(note)}
                      data-testid="note-open"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {note.title || note.body.split('\n')[0]}
                        </span>
                        {note.queued && (
                          <Badge variant="secondary" className="shrink-0">
                            {t('notes.notSent')}
                          </Badge>
                        )}
                      </span>
                      {note.title && note.body && (
                        <span className="line-clamp-2 text-sm break-words text-muted-foreground">
                          {note.body}
                        </span>
                      )}
                      {note.remindAt && (
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <AlarmClockIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span>{formatReminder(note.remindAt, locale())}</span>
                          {STATE_BADGE[state] && (
                            <Badge variant={STATE_BADGE[state]} data-testid="note-state">
                              {t(`notes.states.${state}`)}
                            </Badge>
                          )}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center justify-between gap-2">
                      <NoteQuickActions note={note} />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-destructive"
                        aria-label={t('notes.delete')}
                        onClick={() => setDeleting(note)}
                        data-testid="note-delete"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <NoteSheet note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('notes.deleteTitle')}
          description={t('notes.deleteHint')}
          confirmLabel={t('notes.delete')}
          onConfirm={() => queueNoteChange({ type: 'delete', key: noteKey(deleting) })}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
