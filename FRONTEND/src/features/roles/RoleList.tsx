import { LockIcon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RoleDto } from '@/api/generated/model'
import { SelectionBar } from '@/components/bulk/SelectionBar'
import type { Selection } from '@/components/bulk/use-selection'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  selection,
  onDeleteSelected,
}: {
  roles: RoleDto[]
  selectedId?: string
  onSelect: (roleId: string) => void
  isDirty: (roleId: string) => boolean
  myLevel: number
  canManage: boolean
  /** Checkboxes for bulk delete (roles:manage). */
  selection?: Selection
  onDeleteSelected?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card className="min-w-0 gap-0 py-0">
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{t('roles.list.title')}</h2>
        <span className="text-xs text-muted-foreground">{t('roles.list.order')}</span>
      </div>
      {selection && (
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Checkbox
            aria-label={t('bulk.selectAll', { count: selection.total, value: selection.total })}
            checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
            onCheckedChange={(v) => selection.setAll(v === true)}
          />
          <span className="text-xs text-muted-foreground">{t('roles.list.selectHint')}</span>
        </div>
      )}
      {selection && (
        <SelectionBar selection={selection}>
          <Button size="sm" variant="destructive" onClick={onDeleteSelected}>
            <Trash2Icon />
            {t('bulk.deleteSelected')}
          </Button>
        </SelectionBar>
      )}
      <ul
        className="max-h-80 space-y-1 overflow-y-auto p-2 lg:max-h-[36rem]"
        aria-label={t('roles.list.title')}
      >
        {roles.map((role) => {
          const selected = role.id === selectedId
          const lock = canManage ? roleLock(role, myLevel) : null
          return (
            <li key={role.id} className="flex items-start gap-2">
              {selection && (
                <Checkbox
                  className="ms-1 mt-2.5"
                  aria-label={t('bulk.selectRow', { name: roleName(role) })}
                  checked={selection.has(role.id)}
                  onCheckedChange={(v) => selection.toggle(role.id, v === true)}
                />
              )}
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(role.id)}
                className={cn(
                  'grid w-full min-w-0 gap-1 rounded-md px-3 py-2 text-start transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
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
