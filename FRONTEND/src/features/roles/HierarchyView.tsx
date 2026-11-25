import { UserIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoleDto } from '@/api/generated/model'
import { SectionHeading } from '@/components/SectionHeading'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { roleName } from './role-rules'
import { LevelBadge, LockedNote, SystemBadge } from './RoleBadges'

/** Accent of each step down the tree (fills only, from the theme tokens); repeats after the last one. */
const TIER_ACCENTS = ['bg-primary', 'bg-green', 'bg-light-blue', 'bg-warning', 'bg-icon']

/**
 * Roles as an org tree: one tier per distinct level (lower number = more authority) with connector lines
 * from the tier above; roles that share a level sit side by side. Each card shows the level, how many users
 * hold the role and whether its permissions are locked. Clicking a role opens it in the Roles tab.
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
  const tiers = levels.map((level) => ({
    level,
    roles: roles.filter((r) => r.level === level).toSorted((a, b) => roleName(a).localeCompare(roleName(b))),
  }))

  return (
    <Card>
      <CardHeader>
        <SectionHeading>{t('roles.hierarchy.title')}</SectionHeading>
        <CardDescription>{t('roles.hierarchy.hint')}</CardDescription>
        <p className="text-sm">
          {Number.isFinite(myLevel)
            ? t('roles.hierarchy.yourLevel', { level: formatNumber(myLevel) })
            : t('roles.hierarchy.noLevel')}
        </p>
      </CardHeader>
      <CardContent>
        {/* --step: indent per tier, narrower on phones. */}
        <ol className="grid [--step:1.25rem] sm:[--step:2rem]" data-testid="role-tree">
          {tiers.map((tier, depth) => {
            const accent = TIER_ACCENTS[depth % TIER_ACCENTS.length]
            return (
              <li
                key={tier.level}
                className="relative pt-4 first:pt-0"
                style={{ paddingInlineStart: `calc(${Math.min(depth, 8)} * var(--step))` } as CSSProperties}
                data-testid="role-tier"
              >
                {depth > 0 && (
                  // Elbow from under the tier above down to the middle of this tier's first row of cards.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-0 h-[3.25rem] w-[calc(var(--step)/2)] rounded-es-lg border-s-2 border-b-2 border-muted-foreground/35"
                    style={{
                      insetInlineStart: `calc(${Math.min(depth, 8) - 1} * var(--step) + var(--step) / 2)`,
                    }}
                  />
                )}
                <ul className="flex flex-wrap gap-3 max-sm:flex-col">
                  {tier.roles.map((role) => (
                    <li key={role.id} className="min-w-0 sm:w-64">
                      <RoleNode
                        role={role}
                        accent={accent}
                        mine={myRoleIds.includes(role.id)}
                        onSelect={() => onSelect(role.id)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

function RoleNode({
  role,
  accent,
  mine,
  onSelect,
}: {
  role: RoleDto
  accent: string
  mine: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex min-h-16 w-full items-stretch overflow-hidden rounded-control border bg-card text-start shadow-card transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        mine && 'border-primary/60 ring-1 ring-primary/30',
      )}
      data-testid="role-node"
    >
      <span className={cn('w-1.5 shrink-0', accent)} aria-hidden />
      <span className="grid min-w-0 flex-1 gap-1.5 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{roleName(role)}</span>
          {mine && <Badge className="shrink-0">{t('roles.hierarchy.yours')}</Badge>}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <LevelBadge level={role.level} />
          {role.isSystem && <SystemBadge />}
          <span className="ms-auto flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
            <UserIcon className="size-3.5" aria-hidden />
            {t('roles.users', { count: role.userCount })}
          </span>
        </span>
        {role.permissionsLocked && <LockedNote reason={t('roles.hierarchy.locked')} />}
      </span>
    </button>
  )
}
