import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CloudUploadIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  ReceiptIcon,
  StickyNoteIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  expensesCreateLine,
  expensesRemoveLine,
  expensesSetDayNote,
  expensesUpdateLine,
  useExpensesDay,
} from '@/api/generated/endpoints'
import type { ExpenseDayDto, ExpenseLineDto, TownDto } from '@/api/generated/model'
import { ConfirmDialog } from '@/components/bulk/ConfirmDialog'
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { monthOf, type DayKey } from '@/lib/egypt-day'
import { handleError, type AppError } from '@/lib/errors'
import { formatMoney, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { readCache, writeCache } from '@/lib/offline-cache'
import { cn } from '@/lib/utils'
import { queueExpenseChange, useExpenseOutbox } from './expense-outbox'
import { applyQueued, parseAmount, type DayView } from './expense-queue'

export const NOTE_MAX = 500

/**
 * A rep's expenses for one day: one line per city with its amount, the day total, notes, and the
 * month total. `own`: the rep's own day; changes go through the offline outbox and show at once.
 * `manage`: a manager looking at a rep; changes go straight to the server.
 */
export function DayExpensesCard({
  day,
  userId,
  mode,
  showMonthLink = false,
}: {
  day: DayKey
  userId?: string
  mode: 'own' | 'manage'
  /** Link the month total to the rep's monthly screen. */
  showMonthLink?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const cacheKey = `expenses-day-${userId ?? 'me'}-${day}`
  const copy = mode === 'own' ? readCache<ExpenseDayDto>(cacheKey) : undefined
  const query = useExpensesDay(
    { day, userId },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 15_000 } },
  )
  const pending = useExpenseOutbox()
  const { towns } = useDoctorReferenceData()
  const [editing, setEditing] = useState<ExpenseLineDto | 'new' | null>(null)

  useEffect(() => {
    if (mode === 'own' && query.data && query.isFetchedAfterMount) writeCache(cacheKey, query.data)
  }, [mode, cacheKey, query.data, query.isFetchedAfterMount])

  const data = query.data
  const view: DayView | null = useMemo(
    () => (data ? applyQueued(data, mode === 'own' ? pending : []) : null),
    [data, pending, mode],
  )

  const refresh = () => invalidateApi(queryClient, '/api/expenses')

  if (!data || !view) {
    return (
      <Card data-testid="day-expenses">
        <CardContent className="px-4">
          {query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <LoadingState rows={2} />
          )}
        </CardContent>
      </Card>
    )
  }

  const future = data.day > data.today
  const locked = !data.canEdit && !future && data.day < data.editableFrom

  const save = async (input: { line?: ExpenseLineDto; cityId: string; amount: number; note: string }) => {
    const city = (towns.data ?? []).find((c) => c.id === input.cityId)
    if (mode === 'own') {
      if (input.line) {
        await queueExpenseChange({
          type: 'update',
          lineId: input.line.id,
          day,
          amount: input.amount,
          note: input.note,
        })
      } else {
        await queueExpenseChange({
          type: 'create',
          lineId: crypto.randomUUID(),
          day,
          cityId: input.cityId,
          cityName: city?.name ?? '',
          cityNameAr: city?.nameAr ?? null,
          amount: input.amount,
          note: input.note.trim() || null,
        })
      }
      return
    }
    if (input.line) await expensesUpdateLine(input.line.id, { amount: input.amount, note: input.note })
    else
      await expensesCreateLine({
        day,
        cityId: input.cityId,
        amount: input.amount,
        note: input.note || null,
        userId,
      })
    await refresh()
  }

  const remove = async (line: ExpenseLineDto) => {
    if (mode === 'own') await queueExpenseChange({ type: 'remove', lineId: line.id, day })
    else {
      await expensesRemoveLine(line.id)
      await refresh()
    }
  }

  return (
    <Card className="gap-3 py-4" data-testid="day-expenses">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptIcon className="size-5 text-primary" aria-hidden />
          {t('expenses.dayTitle')}
        </CardTitle>
        <span className="text-lg font-bold tabular-nums" data-testid="day-expenses-total">
          {formatMoney(view.total)}
        </span>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {view.lines.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            className="py-4"
            title={t('expenses.empty')}
            description={
              future ? t('expenses.futureHint') : data.canEdit ? t('expenses.emptyHint') : undefined
            }
          />
        ) : (
          <ul className="divide-y rounded-control border" data-testid="expense-lines">
            {view.lines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  disabled={!data.canEdit}
                  onClick={() => setEditing(line)}
                  className="flex min-h-14 w-full items-start gap-3 px-3 py-2.5 text-start enabled:hover:bg-accent disabled:cursor-default"
                  data-testid="expense-line"
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {localizedName(line.cityName, line.cityNameAr)}
                      <KindBadge line={line} />
                      {line.queued && (
                        <Badge variant="outline" className="gap-1" data-testid="expense-queued">
                          <CloudUploadIcon className="size-3" aria-hidden />
                          {t('expenses.waiting')}
                        </Badge>
                      )}
                    </span>
                    {line.kind === 'edited' && line.originalAmount !== null && (
                      <span className="text-xs text-muted-foreground">
                        {t('expenses.defaultWas', { amount: formatMoney(line.originalAmount) })}
                      </span>
                    )}
                    {line.note && (
                      <span className="flex items-start gap-1 text-sm text-muted-foreground">
                        <StickyNoteIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span className="break-words">{line.note}</span>
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums" data-testid="expense-amount">
                    {formatMoney(line.amount)}
                  </span>
                  {data.canEdit && (
                    <PencilIcon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {data.canEdit && (
          <Button variant="outline" onClick={() => setEditing('new')} data-testid="expense-add">
            <PlusIcon />
            {t('expenses.add')}
          </Button>
        )}
        {locked && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="expenses-locked">
            <LockIcon className="size-4 shrink-0" aria-hidden />
            {mode === 'own' ? t('expenses.lockedOwn') : t('expenses.locked')}
          </p>
        )}

        <DayNote
          label={t('expenses.dayNote')}
          value={view.note}
          editable={data.canEditNote}
          testId="day-note"
          onSave={async (note) => {
            if (mode === 'own') await queueExpenseChange({ type: 'dayNote', day, note })
            else {
              await expensesSetDayNote(day, { userId, note })
              await refresh()
            }
          }}
        />
        {(data.canManage || data.managerNote) && (
          <DayNote
            label={t('expenses.managerNote')}
            hint={data.managerNoteByName ?? undefined}
            value={data.managerNote}
            editable={data.canManage}
            testId="manager-note"
            onSave={async (managerNote) => {
              await expensesSetDayNote(day, { userId, managerNote })
              await refresh()
            }}
          />
        )}

        {showMonthLink ? (
          <Link
            to="/rep/expenses"
            search={{ month: monthOf(day) }}
            className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-muted/50 px-3 py-2 text-sm hover:bg-accent"
            data-testid="month-link"
          >
            <span className="font-medium text-primary">{t('expenses.monthTotal')}</span>
            <span className="font-semibold tabular-nums" data-testid="day-month-total">
              {formatMoney(view.monthTotal)}
            </span>
          </Link>
        ) : (
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">{t('expenses.monthTotal')}</span>
            <span className="font-semibold tabular-nums" data-testid="day-month-total">
              {formatMoney(view.monthTotal)}
            </span>
          </div>
        )}
      </CardContent>

      {editing && (
        <LineDialog
          line={editing === 'new' ? undefined : editing}
          towns={towns.data ?? []}
          taken={view.lines.map((l) => l.cityId)}
          onClose={() => setEditing(null)}
          onSave={save}
          onRemove={remove}
        />
      )}
    </Card>
  )
}

function KindBadge({ line }: { line: ExpenseLineDto }) {
  const { t } = useTranslation()
  if (line.kind === 'auto') return <Badge variant="secondary">{t('expenses.kinds.auto')}</Badge>
  if (line.kind === 'manual') return <Badge variant="outline">{t('expenses.kinds.manual')}</Badge>
  return (
    <Badge variant="warning" data-testid="expense-edited">
      {t('expenses.kinds.edited')}
    </Badge>
  )
}

/** Add a line (city, amount from the city's default, note) or change one (amount, note, remove). */
function LineDialog({
  line,
  towns,
  taken,
  onClose,
  onSave,
  onRemove,
}: {
  line?: ExpenseLineDto
  towns: TownDto[]
  /** Cities that already have a line that day. */
  taken: string[]
  onClose: () => void
  onSave: (input: { line?: ExpenseLineDto; cityId: string; amount: number; note: string }) => Promise<void>
  onRemove: (line: ExpenseLineDto) => Promise<void>
}) {
  const { t } = useTranslation()
  const [cityId, setCityId] = useState(line?.cityId ?? '')
  const [amount, setAmount] = useState(line ? String(line.amount) : '')
  const [note, setNote] = useState(line?.note ?? '')
  const [error, setError] = useState<AppError | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const free = towns.filter((c) => !taken.includes(c.id) || c.id === line?.cityId)
  const parsed = parseAmount(amount)
  const valid = cityId !== '' && parsed !== null && note.length <= NOTE_MAX

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || parsed === null) return
    setBusy(true)
    setError(null)
    try {
      await onSave({ line, cityId, amount: parsed, note: note.trim() })
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: line ? 'expenses.update' : 'expenses.create' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent className="sm:max-w-md" data-testid="expense-dialog">
          <DialogHeader>
            <DialogTitle>{line ? t('expenses.editTitle') : t('expenses.addTitle')}</DialogTitle>
            <DialogDescription>
              {line ? localizedName(line.cityName, line.cityNameAr) : t('expenses.addHint')}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
            {!line && (
              <div className="grid gap-2">
                <Label htmlFor="expense-city">{t('expenses.city')}</Label>
                <NativeSelect
                  id="expense-city"
                  value={cityId}
                  onChange={(e) => {
                    setCityId(e.target.value)
                    const town = towns.find((c) => c.id === e.target.value)
                    if (town && (amount === '' || parseAmount(amount) === 0))
                      setAmount(String(town.defaultDailyExpense ?? 0))
                  }}
                >
                  <option value="">{t('expenses.chooseCity')}</option>
                  {free.map((c) => (
                    <option key={c.id} value={c.id}>
                      {localizedName(c.name, c.nameAr)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="expense-amount">{t('expenses.amount')}</Label>
              <Input
                id="expense-amount"
                inputMode="decimal"
                dir="ltr"
                className="text-end tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amount !== '' && parsed === null}
                autoFocus={!!line}
              />
              {line?.originalAmount !== null && line?.originalAmount !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {t('expenses.defaultWas', { amount: formatMoney(line.originalAmount) })}
                </p>
              )}
              {amount !== '' && parsed === null && (
                <p className="text-sm text-destructive">{t('expenses.amountInvalid')}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-note">
                {t('expenses.note')} <span className="text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <Textarea
                id="expense-note"
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-end text-xs text-muted-foreground tabular-nums">
                {note.length}/{NOTE_MAX}
              </p>
            </div>
            <FormError error={error} />
            <DialogFooter>
              {line && (
                <Button
                  type="button"
                  variant="outlineDestructive"
                  className="sm:me-auto"
                  onClick={() => setConfirmRemove(true)}
                  disabled={busy}
                  data-testid="expense-remove"
                >
                  <Trash2Icon />
                  {t('expenses.remove')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!valid || busy} data-testid="expense-save">
                {busy ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirmRemove && line && (
        <ConfirmDialog
          title={t('expenses.removeTitle')}
          description={t('expenses.removeText', { city: localizedName(line.cityName, line.cityNameAr) })}
          confirmLabel={t('expenses.remove')}
          onConfirm={async () => {
            await onRemove(line)
            onClose()
          }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </>
  )
}

/** A note shown as text, with an inline editor when it may be changed. */
function DayNote({
  label,
  hint,
  value,
  editable,
  testId,
  onSave,
}: {
  label: string
  hint?: string
  value: string | null
  editable: boolean
  testId: string
  onSave: (note: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!editable && !value) return null

  if (draft === null) {
    return (
      <div className="grid gap-1" data-testid={testId}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <StickyNoteIcon className="size-3.5" aria-hidden />
          {label}
          {hint && <span className="font-normal">· {hint}</span>}
        </span>
        <div className="flex items-start gap-2">
          <p className={cn('min-w-0 flex-1 text-sm break-words', !value && 'text-muted-foreground')}>
            {value ?? t('expenses.noNote')}
          </p>
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft(value ?? '')}
              data-testid={`${testId}-edit`}
            >
              <PencilIcon />
              {value ? t('common.edit') : t('expenses.addNote')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void onSave(draft.trim())
          .then(() => setDraft(null))
          .catch((err: unknown) => handleError(err, { context: 'expenses.note' }))
          .finally(() => setBusy(false))
      }}
      data-testid={`${testId}-form`}
    >
      <Label htmlFor={`${testId}-input`}>{label}</Label>
      <Textarea
        id={`${testId}-input`}
        value={draft}
        maxLength={NOTE_MAX}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {draft.length}/{NOTE_MAX}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={busy} data-testid={`${testId}-save`}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </form>
  )
}
