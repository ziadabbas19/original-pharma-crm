import { LockIcon, ShieldIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Hierarchy level of a role (lower number = more authority). */
export function LevelBadge({ level, className }: { level: number; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className={cn('font-normal text-muted-foreground tabular-nums', className)}
      title={t('roles.levelHint')}
    >
      {t('roles.level', { level: formatNumber(level) })}
    </Badge>
  )
}

/** Seeded role: renamable, never deletable. */
export function SystemBadge({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" className={className} title={t('roles.systemHint')}>
      <ShieldIcon aria-hidden />
      {t('roles.system')}
    </Badge>
  )
}

/** A short reason why something is read-only. */
export function LockedNote({ reason, className }: { reason: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <LockIcon className="size-3 shrink-0" aria-hidden />
      {reason}
    </span>
  )
}
