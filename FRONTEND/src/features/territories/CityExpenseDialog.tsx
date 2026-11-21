import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { territoriesSetExpenseDefault } from '@/api/generated/endpoints'
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
import { localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'

/** The town as the territory tree and the rep's expense screen both list it. */
interface TownWithAmount {
  id: string
  name: string
  nameAr?: string | null
  defaultDailyExpense?: number
}

/**
 * A city's default daily expense (expenses:settings, within its scope). Zero: visits there add no
 * expense line. Used on Areas & towns and on the rep's expenses screen.
 */
export function CityExpenseDialog({ town, onClose }: { town: TownWithAmount; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(String(town.defaultDailyExpense ?? 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const amount = parseAmount(value)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (amount === null) return
    setBusy(true)
    setError(null)
    try {
      await territoriesSetExpenseDefault(town.id, { defaultDailyExpense: amount })
      await invalidateApi(queryClient, '/api/territories', '/api/lookups')
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'territories.expense' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="city-expense-dialog">
        <DialogHeader>
          <DialogTitle>{t('territories.setDailyExpense')}</DialogTitle>
          <DialogDescription>{localizedName(town.name, town.nameAr)}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <div className="grid gap-2">
            <Label htmlFor="city-expense">{t('territories.dailyExpenseLabel')}</Label>
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
            <p className="text-xs text-muted-foreground">{t('territories.dailyExpenseHint')}</p>
            <p className="text-xs text-muted-foreground">{t('expenses.cityAmounts.note')}</p>
          </div>
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
