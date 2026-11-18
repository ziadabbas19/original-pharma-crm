import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { productsMoveToLine } from '@/api/generated/endpoints'
import type { BulkResult, ProductLineDto } from '@/api/generated/model'
import { BulkProgressBar } from '@/components/bulk/BulkProgressBar'
import { BulkResultSummary } from '@/components/bulk/BulkResultSummary'
import { type BulkProgress, runInBatches } from '@/components/bulk/run-in-batches'
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
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { formatNumber, localizedName } from '@/lib/format'

const NO_LINE = 'none'

/** Puts the selected products in a line, or takes them out of their line. */
export function MoveToLineDialog({
  productIds,
  lines,
  nameOf,
  onDone,
  onClose,
}: {
  productIds: string[]
  lines: ProductLineDto[]
  nameOf: (id: string) => string
  /** Ids that could not be moved (they stay selected). */
  onDone: (blocked: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<BulkResult | null>(null)

  const move = async () => {
    setBusy(true)
    setError(null)
    try {
      const productLineId = target === NO_LINE ? null : target
      const done = await runInBatches(
        productIds,
        (ids) => productsMoveToLine({ productIds: ids, productLineId }),
        { onProgress: setProgress },
      )
      setResult(done)
      onDone(done.items.filter((i) => i.outcome === 'blocked').map((i) => i.id))
      await queryClient.invalidateQueries({ queryKey: ['/api/products'] })
      await queryClient.invalidateQueries({ queryKey: ['/api/product-lines'] })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('catalog.moveTitle', { count: productIds.length, value: formatNumber(productIds.length) })}
          </DialogTitle>
          <DialogDescription>{t('catalog.moveHint')}</DialogDescription>
        </DialogHeader>
        {result ? (
          <BulkResultSummary result={result} nameOf={nameOf} />
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="move-line">{t('catalog.line')}</Label>
            <NativeSelect id="move-line" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('orders.form.choose')}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {localizedName(l.nameEn, l.nameAr)}
                </option>
              ))}
              <option value={NO_LINE}>{t('catalog.noLine')}</option>
            </NativeSelect>
          </div>
        )}
        {busy && progress && <BulkProgressBar progress={progress} />}
        <FormError error={error} />
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>{t('common.close')}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button disabled={busy || !target} onClick={() => void move()}>
                {busy && <Loader2Icon className="animate-spin" />}
                {t('catalog.move')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
