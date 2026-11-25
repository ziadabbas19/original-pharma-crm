import { BellOffIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { egyptToday } from '@/lib/egypt-day'
import { handleError } from '@/lib/errors'
import { locale } from '@/lib/format'
import { platform } from '@/lib/platform'
import { toast } from '@/lib/toast'
import { queueNoteChange } from './note-outbox'
import { noteKey, type NoteView } from './note-queue'
import {
  BEFORE_PRESETS,
  beforeChoiceOf,
  egyptDayAndTime,
  egyptInstant,
  formatReminder,
  isTimeKey,
  MAX_BEFORE_MINUTES,
  notifyAtOf,
  parseBeforeMinutes,
} from './note-time'
import { useNow } from './use-now'

const TITLE_MAX = 120
const BODY_MAX = 4000

/** The next whole hour on Egypt's clock: the reminder a new note starts with. */
function nextHour(): { day: string; time: string } {
  return egyptDayAndTime(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000)
}

/**
 * Write or change a note: title, text and an optional reminder (a day and time in Egypt time, and how
 * long before it to be notified). Saving goes through the outbox, so it works offline. The first time a
 * reminder is saved on the phone, the app asks for the notifications permission and explains when it
 * was refused.
 */
export function NoteSheet({ note, onClose }: { note: NoteView | null; onClose: () => void }) {
  const { t } = useTranslation()
  const start = note?.remindAt ? egyptDayAndTime(note.remindAt) : nextHour()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [remind, setRemind] = useState(Boolean(note?.remindAt))
  const [day, setDay] = useState(start.day)
  const [time, setTime] = useState(start.time)
  const [beforeChoice, setBeforeChoice] = useState(beforeChoiceOf(note?.remindBeforeMinutes))
  const [custom, setCustom] = useState(String(note?.remindBeforeMinutes ?? 0))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  const before = beforeChoice === 'custom' ? parseBeforeMinutes(custom) : Number(beforeChoice)
  const remindAt = remind && day && isTimeKey(time) ? egyptInstant(day, time) : null
  const notifyAt = remindAt ? notifyAtOf(remindAt, before) : null
  const now = useNow()
  const inPast = notifyAt !== null && new Date(notifyAt).getTime() <= now

  const save = async () => {
    if (!title.trim() && !body.trim()) return setError(t('notes.needText'))
    if (remind && (!remindAt || before === null))
      return setError(t('notes.customInvalid', { max: MAX_BEFORE_MINUTES }))
    setError(null)
    setBusy(true)
    try {
      const fields = {
        title: title.trim() || null,
        body: body.trim(),
        remindAt,
        remindBeforeMinutes: remindAt ? before : null,
      }
      await queueNoteChange(
        note
          ? { type: 'update', key: noteKey(note), ...fields }
          : { type: 'create', key: crypto.randomUUID(), ...fields },
      )
      // The first reminder saved on the phone asks for the notifications permission.
      const reminders = platform().reminders
      if (remindAt && reminders.supported) {
        let state = await reminders.permission()
        if (state === 'prompt') state = await reminders.requestPermission()
        if (state === 'denied') {
          setDenied(true)
          return
        }
      }
      toast.show({ tone: 'success', message: t('notes.saved') })
      onClose()
    } catch (e) {
      handleError(e, { context: 'notes.save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !busy && onClose()}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col gap-0 p-0" data-testid="note-sheet">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{note ? t('notes.edit') : t('notes.new')}</SheetTitle>
          <SheetDescription>{t('notes.privateHint')}</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 gap-4 overflow-y-auto p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="note-title">{t('notes.titleLabel')}</Label>
            <Input
              id="note-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="note-title"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="note-body">{t('notes.bodyLabel')}</Label>
            <Textarea
              id="note-body"
              value={body}
              maxLength={BODY_MAX}
              rows={5}
              placeholder={t('notes.bodyPlaceholder')}
              onChange={(e) => setBody(e.target.value)}
              data-testid="note-body"
            />
          </div>

          <label className="flex min-h-11 items-center gap-3 font-medium">
            <Checkbox
              checked={remind}
              onCheckedChange={(v) => setRemind(v === true)}
              data-testid="note-remind"
            />
            {t('notes.remind')}
          </label>

          {remind && (
            <div
              className="grid gap-3 rounded-card border bg-muted/40 p-3"
              data-testid="note-reminder-fields"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="note-day">{t('notes.day')}</Label>
                  <Input
                    id="note-day"
                    type="date"
                    value={day}
                    min={egyptToday()}
                    onChange={(e) => setDay(e.target.value)}
                    data-testid="note-day"
                  />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="note-time">{t('notes.time')}</Label>
                  <Input
                    id="note-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    data-testid="note-time"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="note-before">{t('notes.before')}</Label>
                <NativeSelect
                  id="note-before"
                  value={beforeChoice}
                  onChange={(e) => setBeforeChoice(e.target.value)}
                  data-testid="note-before"
                >
                  {BEFORE_PRESETS.map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {t(`notes.beforeOptions.${minutes}`)}
                    </option>
                  ))}
                  <option value="custom">{t('notes.beforeOptions.custom')}</option>
                </NativeSelect>
              </div>
              {beforeChoice === 'custom' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="note-custom">{t('notes.customMinutes')}</Label>
                  <Input
                    id="note-custom"
                    inputMode="numeric"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-invalid={before === null}
                    data-testid="note-custom"
                  />
                </div>
              )}
              {notifyAt && (
                <p className="text-sm text-muted-foreground" data-testid="note-notify-at">
                  {inPast
                    ? t('notes.notifyNow')
                    : t('notes.notifyAt', { time: formatReminder(notifyAt, locale()) })}
                </p>
              )}
            </div>
          )}

          {denied && (
            <Alert variant="warning" data-testid="note-permission-denied">
              <BellOffIcon />
              <AlertDescription>
                <p>{t('notes.permissionDenied')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void platform().deviceHealth.openNotificationSettings()}
                >
                  {t('notes.openSettings')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <p className="text-sm font-medium text-destructive" role="alert" data-testid="note-error">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {denied ? (
            <Button size="lg" className="flex-1" onClick={onClose} data-testid="note-close">
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button size="lg" variant="outline" className="flex-1" disabled={busy} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => void save()}
                data-testid="note-save"
              >
                {busy && <Loader2Icon className="animate-spin" />}
                {t('notes.save')}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
