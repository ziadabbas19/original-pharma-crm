import { CheckCircle2Icon, CloudOffIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { useVisitOutbox, visitSyncState } from './visit-outbox'

export function VisitSyncBadge({ visitId }: { visitId: string }) {
  const { t } = useTranslation()
  const outbox = useVisitOutbox()
  const state = visitSyncState(visitId, outbox)
  switch (state) {
    case 'sent':
      return (
        <Badge variant="success" data-testid="sync-sent">
          <CheckCircle2Icon aria-hidden />
          {t('visits.sync.sent')}
        </Badge>
      )
    case 'sending':
      return (
        <Badge variant="secondary" data-testid="sync-sending">
          <Loader2Icon className="animate-spin" aria-hidden />
          {t('visits.sync.sending')}
        </Badge>
      )
    case 'waiting':
      return (
        <Badge variant="warning" data-testid="sync-waiting">
          <CloudOffIcon aria-hidden />
          {t('visits.sync.waiting')}
        </Badge>
      )
    case 'refused':
      return (
        <Badge variant="destructive" data-testid="sync-refused">
          <TriangleAlertIcon aria-hidden />
          {t('visits.sync.refused')}
        </Badge>
      )
  }
}
