import { LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RoleDto } from '@/api/generated/model'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { roleLock, roleName } from './role-rules'
import { LevelBadge, SystemBadge } from './RoleBadges'

/** Roles ordered by level; picks the role shown in the edit panel. */
export function RoleList({
  roles,
  selectedId,
  onSelect,
  isDirty,
  myLevel,
  canManage,
}: {
  roles: RoleDto[]
  selectedId?: string
  onSelect: (roleId: string) => void
  isDirty: (roleId: string) => boolean
  myLevel: number
  canManage: boolean
}) {
  const { t } = useTranslation()
  return (
    <Card className="min-w-0 gap-0 py-0">
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{t('roles.list.title')}</h2>
        <span className="text-xs text-muted-foreground">{t('roles.list.order')}</span>
      </div>
      <ul
        className="max-h-80 space-y-1 overflow-y-auto p-2 lg:max-h-[36rem]"
        aria-label={t('roles.list.title')}
      >
        {roles.map((role) => {
          const selected = role.id === selectedId
          const lock = canManage ? roleLock(role, myLevel) : null
          return (
            <li key={role.id}>
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(role.id)}
                className={cn(
                  'grid w-full gap-1 rounded-md px-3 py-2 text-start transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'bg-accent',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{roleName(role)}</span>
                  {isDirty(role.id) && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-warning"
                      title={t('roles.list.unsaved')}
                      aria-label={t('roles.list.unsaved')}
                    />
                  )}
                  {(lock || role.permissionsLocked) && (
                    <LockIcon
                      className="ms-auto size-3.5 shrink-0 text-muted-foreground"
                      aria-label={role.permissionsLocked ? t('roles.adminLocked') : t(`roles.reason.${lock}`)}
                    />
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <LevelBadge level={role.level} />
                  {role.isSystem && <SystemBadge />}
                  <span className="text-xs text-muted-foreground">
                    {t('roles.users', { count: role.userCount })}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
