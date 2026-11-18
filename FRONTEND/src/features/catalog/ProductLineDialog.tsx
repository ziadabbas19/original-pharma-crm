import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useProductLinesCreate, useProductLinesUpdate } from '@/api/generated/endpoints'
import type { ProductLineDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { DiscountFields } from './discount-fields'
import { parsePercent, percentError } from './discount-rules'

/** Create (line = null) or edit a product line. */
export function ProductLineDialog({ line, onClose }: { line: ProductLineDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const create = useProductLinesCreate()
  const update = useProductLinesUpdate()
  const [nameAr, setNameAr] = useState(line?.nameAr ?? '')
  const [nameEn, setNameEn] = useState(line?.nameEn ?? '')
  const [description, setDescription] = useState(line?.description ?? '')
  const [active, setActive] = useState(line?.isActive ?? true)
  const [defaultDiscount, setDefaultDiscount] = useState(line?.defaultDiscountPercent?.toString() ?? '')
  const [maxDiscount, setMaxDiscount] = useState(line?.maxDiscountPercent?.toString() ?? '')
  const defaultValue = parsePercent(defaultDiscount)
  const maxValue = parsePercent(maxDiscount)
  const defaultProblem =
    percentError(defaultValue) ??
    (defaultValue !== null && maxValue !== null && !Number.isNaN(maxValue) && defaultValue > maxValue
      ? 'catalog.defaultAboveOwnMax'
      : undefined)
  const maxProblem = percentError(maxValue)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const busy = create.isPending || update.isPending

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!nameAr.trim() || !nameEn.trim() || defaultProblem || maxProblem) return
    const data = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      description: description.trim() || null,
      isActive: active,
      defaultDiscountPercent: defaultValue,
      maxDiscountPercent: maxValue,
    }
    try {
      if (line) await update.mutateAsync({ id: line.id, data })
      else await create.mutateAsync({ data })
      await queryClient.invalidateQueries({ queryKey: ['/api/product-lines'] })
      await queryClient.invalidateQueries({ queryKey: ['/api/products'] })
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{line ? t('catalog.editLine') : t('catalog.addLine')}</DialogTitle>
          <DialogDescription>{t('catalog.lineHint')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="line-name-ar">{t('catalog.nameAr')}</Label>
              <Input
                id="line-name-ar"
                dir="rtl"
                maxLength={150}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                aria-invalid={touched && !nameAr.trim()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="line-name-en">{t('catalog.nameEn')}</Label>
              <Input
                id="line-name-en"
                dir="ltr"
                maxLength={150}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                aria-invalid={touched && !nameEn.trim()}
              />
            </div>
          </div>
          {touched && (!nameAr.trim() || !nameEn.trim()) && (
            <p className="text-sm text-destructive">{t('catalog.namesRequired')}</p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="line-description">{t('catalog.description')}</Label>
            <Textarea
              id="line-description"
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DiscountFields
            idPrefix="line-discount"
            defaultValue={defaultDiscount}
            maxValue={maxDiscount}
            onDefaultChange={setDefaultDiscount}
            onMaxChange={setMaxDiscount}
            touched={touched}
            defaultError={defaultProblem && t(defaultProblem)}
            maxError={maxProblem && t(maxProblem)}
            hint={t('catalog.lineDiscountFormHint')}
          />
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t('catalog.active')}
          </Label>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
