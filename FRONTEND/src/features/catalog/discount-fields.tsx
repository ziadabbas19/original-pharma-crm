import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Default and maximum discount inputs (product and line forms). */
export function DiscountFields({
  idPrefix,
  defaultValue,
  maxValue,
  onDefaultChange,
  onMaxChange,
  touched,
  defaultError,
  maxError,
  hint,
}: {
  idPrefix: string
  defaultValue: string
  maxValue: string
  onDefaultChange: (value: string) => void
  onMaxChange: (value: string) => void
  touched: boolean
  defaultError?: string
  maxError?: string
  hint?: string
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="grid gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{t('catalog.discounts')}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-default`}>{t('catalog.defaultDiscount')}</Label>
          <Input
            id={`${idPrefix}-default`}
            dir="ltr"
            inputMode="decimal"
            placeholder="—"
            value={defaultValue}
            onChange={(e) => onDefaultChange(e.target.value)}
            aria-invalid={touched && !!defaultError}
          />
          {touched && defaultError && <p className="text-sm text-destructive">{defaultError}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-max`}>{t('catalog.maxDiscount')}</Label>
          <Input
            id={`${idPrefix}-max`}
            dir="ltr"
            inputMode="decimal"
            placeholder="—"
            value={maxValue}
            onChange={(e) => onMaxChange(e.target.value)}
            aria-invalid={touched && !!maxError}
          />
          {touched && maxError && <p className="text-sm text-destructive">{maxError}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? t('catalog.discountHint')}</p>
    </fieldset>
  )
}
