import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { VisitDetailDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { draftToContent, type VisitDraft } from './active-visit'
import { queueVisitContent } from './visit-outbox'
import { VisitContentFields } from './VisitContentFields'

/** Changing the feedback and products after the visit. Saved through the device outbox, so it works offline. */
export function VisitContentForm({ visit, onSaved }: { visit: VisitDetailDto; onSaved: () => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<VisitDraft>({
    text: visit.feedback?.text ?? '',
    category: visit.feedback?.category ?? null,
    products: visit.products.map((p) => ({
      productId: p.productId,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      thumbnailUrl: p.thumbnailUrl,
      note: p.note ?? '',
    })),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await queueVisitContent(visit.id, visit.customerName, draftToContent(draft))
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
      <VisitContentFields value={draft} onChange={setDraft} />
      <FormError error={error} />
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2Icon className="animate-spin" />}
        {t('common.save')}
      </Button>
    </form>
  )
}
