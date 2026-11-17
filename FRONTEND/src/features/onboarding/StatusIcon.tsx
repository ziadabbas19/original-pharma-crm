import { CheckCircle2Icon, CircleDashedIcon, MinusCircleIcon, XCircleIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CheckStatus } from '@/store/slices/trackingSlice'
import { cn } from '@/lib/utils'

const ICONS = {
  done: { Icon: CheckCircle2Icon, className: 'text-success' },
  pending: { Icon: CircleDashedIcon, className: 'text-muted-foreground' },
  problem: { Icon: XCircleIcon, className: 'text-destructive' },
  notApplicable: { Icon: MinusCircleIcon, className: 'text-muted-foreground' },
} as const

export function StatusIcon({ status, withLabel = false }: { status: CheckStatus; withLabel?: boolean }) {
  const { t } = useTranslation()
  const { Icon, className } = ICONS[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Icon className="size-5 shrink-0" aria-hidden />
      {withLabel ? t(`status.${status}`) : <span className="sr-only">{t(`status.${status}`)}</span>}
    </span>
  )
}
