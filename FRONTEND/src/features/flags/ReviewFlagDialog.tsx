import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getTrackingMonitorGetDevicesQueryKey,
  getTrackingMonitorGetFlagsQueryKey,
  getTrackingMonitorGetPresenceQueryKey,
  useTrackingMonitorReviewFlag,
} from '@/api/generated/endpoints'
import type { TrackingFlagDto, TrackingFlagStatus } from '@/api/generated/model'
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
import { formatDateTime } from '@/lib/format'
import { FlagStatusBadge, FlagTypeBadge, ScoreBadge, SignalList } from './flag-display'

/** Confirm or dismiss an open flag (with an optional note), or reopen a reviewed one. */
export function ReviewFlagDialog({ flag, onClose }: { flag: TrackingFlagDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const review = useTrackingMonitorReviewFlag(inlineErrors)
  const [note, setNote] = useState('')

  const submit = async (status: TrackingFlagStatus) => {
    await review.mutateAsync({ flagId: flag.id, data: { status, note: note.trim() || null } })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getTrackingMonitorGetFlagsQueryKey().slice(0, 1) }),
      queryClient.invalidateQueries({ queryKey: getTrackingMonitorGetDevicesQueryKey().slice(0, 1) }),
      queryClient.invalidateQueries({ queryKey: getTrackingMonitorGetPresenceQueryKey() }),
    ])
    onClose()
  }

  const run = (status: TrackingFlagStatus) => void submit(status).catch(() => {})

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('flags.review.title')}</DialogTitle>
          <DialogDescription>{t('flags.review.description')}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('flags.rep')}</dt>
          <dd className="font-medium">{flag.userName ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('flags.type')}</dt>
          <dd>
            <FlagTypeBadge type={flag.type} />
          </dd>
          <dt className="text-muted-foreground">{t('flags.raised')}</dt>
          <dd>{formatDateTime(flag.createdAt)}</dd>
          <dt className="text-muted-foreground">{t('flags.score')}</dt>
          <dd>
            <ScoreBadge score={flag.score} />
          </dd>
          <dt className="text-muted-foreground">{t('flags.status')}</dt>
          <dd>
            <FlagStatusBadge status={flag.status} />
          </dd>
          <dt className="self-start text-muted-foreground">{t('flags.signalsLabel')}</dt>
          <dd>
            <SignalList signals={flag.signals} />
          </dd>
        </dl>
        {flag.details && (
          <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">{flag.details}</p>
        )}

        <div className="grid gap-2">
          <Label htmlFor="flag-note">{t('flags.review.note')}</Label>
          <Textarea
            id="flag-note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('flags.review.notePlaceholder')}
          />
        </div>

        <FormError error={review.error} />

        <DialogFooter>
          {flag.status === 'open' ? (
            <>
              <Button variant="outline" disabled={review.isPending} onClick={() => run('dismissed')}>
                <XIcon />
                {t('flags.review.dismiss')}
              </Button>
              <Button variant="destructive" disabled={review.isPending} onClick={() => run('confirmed')}>
                <CheckIcon />
                {t('flags.review.confirm')}
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={review.isPending} onClick={() => run('open')}>
              <RotateCcwIcon />
              {t('flags.review.reopen')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
