import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocationIntegrityAcknowledgeEvent } from '@/api/generated/endpoints'
import type { IntegrityEventDto } from '@/api/generated/model'
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
import { Textarea } from '@/components/ui/textarea'
import { inlineErrors } from '@/lib/errors'
import { invalidateApi } from '@/lib/invalidate-api'

/** The reviewer has seen the event and says what they did about it. */
export function AcknowledgeEventDialog({
  event,
  onClose,
}: {
  event: IntegrityEventDto
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const acknowledge = useLocationIntegrityAcknowledgeEvent(inlineErrors)
  const [comment, setComment] = useState(event.reviewNote ?? '')
  const empty = comment.trim() === ''

  const submit = async () => {
    await acknowledge.mutateAsync({ eventId: event.id, data: { comment: comment.trim() } })
    await invalidateApi(queryClient, '/api/tracking/integrity', '/api/tracking/monitor')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('suspicious.acknowledge.title')}</DialogTitle>
          <DialogDescription>
            {t('suspicious.acknowledge.description', { rep: event.userName })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!empty) void submit().catch(() => {})
          }}
        >
          <Label htmlFor="acknowledge-comment">{t('suspicious.acknowledge.comment')}</Label>
          <Textarea
            id="acknowledge-comment"
            rows={4}
            maxLength={1000}
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('suspicious.acknowledge.commentPlaceholder')}
            data-testid="acknowledge-comment"
          />
          <FormError error={acknowledge.error} />
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={empty || acknowledge.isPending} data-testid="acknowledge-submit">
              <CheckIcon />
              {t('suspicious.acknowledge.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
