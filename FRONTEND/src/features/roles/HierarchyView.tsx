import { CornerDownRightIcon, UserIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RoleDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { roleName } from './role-rules'
import { LevelBadge, SystemBadge } from './RoleBadges'

/**
 * Roles as an indented list: one indent step per distinct level, so roles that share a
 * level sit side by side. Shows how many users hold each role.
 */
export function HierarchyView({
  roles,
  myRoleIds,
  myLevel,
  onSelect,
}: {
  roles: RoleDto[]
  myRoleIds: readonly string[]
  myLevel: number
  onSelect: (roleId: string) => void
}) {
  const { t } = useTranslation()
  const levels = [...new Set(roles.map((r) => r.level))].toSorted((a, b) => a - b)
  const sorted = roles.toSorted((a, b) => a.level - b.level)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('roles.hierarchy.title')}</CardTitle>
        <CardDescription>{t('roles.hierarchy.hint')}</CardDescription>
        <p className="text-sm">
          {Number.isFinite(myLevel)
            ? t('roles.hierarchy.yourLevel', { level: formatNumber(myLevel) })
            : t('roles.hierarchy.noLevel')}
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1.5">
          {sorted.map((role) => {
            const depth = levels.indexOf(role.level)
            const mine = myRoleIds.includes(role.id)
            return (
              <li key={role.id} style={{ paddingInlineStart: `${Math.min(depth, 12) * 1.5}rem` }}>
                <button
                  type="button"
                  onClick={() => onSelect(role.id)}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-start transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                    mine && 'border-primary/50 bg-primary/5',
                  )}
                >
                  {depth > 0 && (
                    <CornerDownRightIcon
                      className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
                      aria-hidden
                    />
                  )}
                  <span className="font-medium">{roleName(role)}</span>
                  <LevelBadge level={role.level} />
                  {role.isSystem && <SystemBadge />}
                  {mine && <Badge>{t('roles.hierarchy.yours')}</Badge>}
                  <span className="ms-auto flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                    <UserIcon className="size-3.5" aria-hidden />
                    {t('roles.users', { count: role.userCount })}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
