import { useTranslation } from 'react-i18next'
import type { ProductLineDto } from '@/api/generated/model'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { localizedName } from '@/lib/format'
import { toggleLine, type LineChoice } from './product-line-choice'

/** "All product lines" on top; the line checkboxes only when the user is limited to some of them. */
export function ProductLinesField({
  idPrefix,
  lines,
  value,
  onChange,
  error,
}: {
  idPrefix: string
  lines: ProductLineDto[]
  value: LineChoice
  onChange: (value: LineChoice) => void
  error?: string | null
}) {
  const { t } = useTranslation()
  const allId = `${idPrefix}-all`
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{t('users.productLines')}</legend>
      <p className="text-xs text-muted-foreground">{t('users.productLinesHint')}</p>
      <Label htmlFor={allId} className="flex items-center gap-2 rounded-md border p-2.5 font-normal">
        <Checkbox
          id={allId}
          checked={value.all}
          onCheckedChange={(v) => onChange({ ...value, all: v === true })}
        />
        {t('users.allProductLines')}
      </Label>
      {!value.all && (
        <div className="grid gap-2 sm:grid-cols-3">
          {lines.map((line) => {
            const id = `${idPrefix}-${line.id}`
            return (
              <Label
                key={line.id}
                htmlFor={id}
                className="flex items-center gap-2 rounded-md border p-2.5 font-normal"
              >
                <Checkbox
                  id={id}
                  checked={value.lineIds.includes(line.id)}
                  onCheckedChange={(v) => onChange(toggleLine(value, line.id, v === true))}
                />
                {localizedName(line.nameEn, line.nameAr)}
              </Label>
            )
          })}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  )
}
