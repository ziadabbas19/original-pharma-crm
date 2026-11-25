import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  territoriesClearMyExpenseDefault,
  territoriesSetExpenseDefault,
  territoriesSetMyExpenseDefault,
} from '@/api/generated/endpoints'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
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
import { parseAmount } from '@/features/expenses/expense-queue'
import { handleError, type AppError } from '@/lib/errors'
import { formatMoney, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'

/** The town as the territory tree and the rep's expense screen both list it. */
interface TownWithAmount {
  id: string
  name: string
  nameAr?: string | null
  defaultDailyExpense?: number
  /** The amount is the caller's own (rep screen). */
  isOwn?: boolean
  /** The town's default, used when the caller has no own amount (rep screen). */
  fallbackAmount?: number | null
}

/**
 * A city's daily expense (expenses:settings, within its scope). Zero: visits there add no expense line.
 * On Areas & towns it is the town's default, used by every rep without an amount of their own; on the
 * rep's expenses screen (`mine`) it is the caller's own amount, with "Use the default amount" to go back.
 */
export function CityExpenseDialog({
  town,
  onClose,
  mine = false,
}: {
  town: TownWithAmount
  onClose: () => void
  mine?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(String(town.defaultDailyExpense ?? 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const amount = parseAmount(value)

  const run = async (change: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await change()
      await invalidateApi(queryClient, '/api/territories', '/api/lookups')
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'territories.expense' }))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (amount === null) return
    void run(() =>
      mine
        ? territoriesSetMyExpenseDefault(town.id, { defaultDailyExpense: amount })
        : territoriesSetExpenseDefault(town.id, { defaultDailyExpense: amount }),
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="city-expense-dialog">
        <DialogHeader>
          <DialogTitle>
            {mine ? t('expenses.cityAmounts.myTitle') : t('territories.setDailyExpense')}
          </DialogTitle>
          <DialogDescription>{localizedName(town.name, town.nameAr)}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="city-expense">
              {mine ? t('expenses.cityAmounts.myLabel') : t('territories.dailyExpenseLabel')}
            </Label>
            <Input
              id="city-expense"
              inputMode="decimal"
              dir="ltr"
              className="text-end tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={amount === null}
              autoFocus
              data-testid="city-expense-amount"
            />
            {amount === null && (
              <p className="text-sm text-destructive" data-testid="city-expense-invalid">
                {t('expenses.amountInvalid')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {mine ? t('expenses.cityAmounts.myHint') : t('territories.dailyExpenseHint')}
            </p>
            {mine && town.fallbackAmount != null && (
              <p className="text-xs text-muted-foreground" data-testid="city-expense-fallback">
                {t('expenses.cityAmounts.fallback', {
                  amount:
                    town.fallbackAmount > 0
                      ? formatMoney(town.fallbackAmount)
                      : t('expenses.cityAmounts.none'),
                })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('expenses.cityAmounts.note')}</p>
          </div>
          {mine && town.isOwn && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => territoriesClearMyExpenseDefault(town.id))}
              data-testid="city-expense-use-default"
            >
              {t('expenses.cityAmounts.useDefault')}
            </Button>
          )}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || amount === null} data-testid="city-expense-save">
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
