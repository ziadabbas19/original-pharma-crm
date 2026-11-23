import { useTranslation } from 'react-i18next'
import type { CustomerType } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** "AM" next to a visit to a morning place (hospital); nothing for doctors and pharmacies. */
export function AmBadge({ type, className }: { type?: CustomerType | null; className?: string }) {
  const { t } = useTranslation()
  if (type !== 'hospital') return null
  return (
    <Badge
      variant="outline"
      className={cn('shrink-0 px-1.5 align-middle', className)}
      title={t('visits.amHint')}
      data-testid="visit-am"
    >
      {t('visits.amLabel')}
    </Badge>
  )
}
