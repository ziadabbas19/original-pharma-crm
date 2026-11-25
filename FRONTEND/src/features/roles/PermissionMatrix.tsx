import { CheckCircle2Icon, LockIcon, SaveIcon, Undo2Icon } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { PermissionDto, PermissionScope, RoleDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/SectionHeading'
import { useGrantedPermissions, useMyRoleLevel } from '@/features/auth/usePermission'
import { formatList, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { groupPermissions, permissionLabel, resourceLabel, SCOPES } from './permission-labels'
import { canGrant, roleLock, roleName } from './role-rules'
import type { PermissionDraft } from './usePermissionDraft'

/**
 * Permissions (rows, grouped by resource) x roles (columns, ordered by level); each cell
 * picks no access or a scope. Columns you cannot manage, and Admin, are read-only; scopes
 * broader than your own are offered disabled with the reason.
 */
export function PermissionMatrix({
  roles,
  permissions,
  canManage,
  draft,
  selectedRoleId,
  onSelectRole,
}: {
  roles: RoleDto[]
  permissions: PermissionDto[]
  canManage: boolean
  draft: PermissionDraft
  selectedRoleId?: string
  onSelectRole: (roleId: string) => void
}) {
  const { t } = useTranslation()
  const myLevel = useMyRoleLevel()
  const mine = useGrantedPermissions()
  const groups = useMemo(() => groupPermissions(permissions), [permissions])

  const columnLock = (role: RoleDto): string | null => {
    if (role.permissionsLocked) return t('roles.adminLocked')
    if (!canManage) return t('roles.reason.noManage')
    const lock = roleLock(role, myLevel)
    return lock ? t(`roles.reason.${lock}`) : null
  }

  return (
    <div className="space-y-3">
      <SectionHeading className="px-1">{t('roles.matrix.title')}</SectionHeading>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th
                  scope="col"
                  className="sticky inset-s-0 z-10 min-w-56 bg-muted px-3 py-2 text-start font-medium text-muted-foreground"
                >
                  {t('roles.matrix.permission')}
                </th>
                {roles.map((role) => {
                  const lock = columnLock(role)
                  const selected = role.id === selectedRoleId
                  return (
                    <th
                      key={role.id}
                      scope="col"
                      className={cn(
                        'min-w-36 px-2 py-2 text-start align-top font-medium',
                        selected && 'bg-primary/10',
                      )}
                    >
                      <button
                        type="button"
                        className="grid w-full gap-0.5 rounded-sm text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-pressed={selected}
                        onClick={() => onSelectRole(role.id)}
                      >
                        <span className="flex items-center gap-1">
                          {lock && (
                            <LockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={lock} />
                          )}
                          <span className="truncate">{roleName(role)}</span>
                          {draft.isDirty(role.id) && (
                            <span
                              className="size-2 shrink-0 rounded-full bg-warning"
                              title={t('roles.list.unsaved')}
                            />
                          )}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t('roles.level', { level: formatNumber(role.level) })} ·{' '}
                          {t('roles.users', { count: role.userCount })}
                        </span>
                        {lock && (
                          <span className="truncate text-xs font-normal text-muted-foreground" title={lock}>
                            {lock}
                          </span>
                        )}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.resource}>
                  <tr className="border-b bg-muted/30">
                    <th colSpan={roles.length + 1} scope="colgroup" className="px-3 py-1.5 text-start">
                      <span className="sticky inset-s-3 section-heading inline-flex">
                        {resourceLabel(t, group.resource)}
                      </span>
                    </th>
                  </tr>
                  {group.items.map((permission) => {
                    const label = permissionLabel(t, permission.key, permission.description)
                    return (
                      <tr key={permission.key} className="border-b last:border-0 hover:bg-muted/20">
                        <th
                          scope="row"
                          className="sticky inset-s-0 z-10 bg-card px-3 py-2 text-start font-normal"
                        >
                          <div className="font-medium">{label}</div>
                          <div className="text-xs text-muted-foreground">
                            <span dir="ltr">{permission.key}</span>
                          </div>
                        </th>
                        {roles.map((role) => {
                          const value = draft.valueOf(role, permission.key)
                          const current =
                            role.permissions.find((p) => p.key === permission.key)?.scope ?? null
                          const changed = draft.changes.get(role.id)?.[permission.key] !== undefined
                          const locked = columnLock(role) !== null || draft.saving
                          return (
                            <td
                              key={role.id}
                              className={cn('px-2 py-1.5', role.id === selectedRoleId && 'bg-primary/5')}
                            >
                              <NativeSelect
                                size="sm"
                                className="w-36"
                                value={value ?? ''}
                                disabled={locked}
                                aria-label={`${label}: ${roleName(role)}`}
                                selectClassName={cn(
                                  value ? 'font-medium text-foreground' : 'text-muted-foreground',
                                  changed && 'border-warning bg-warning/15',
                                )}
                                onChange={(e) =>
                                  draft.setCell(
                                    role,
                                    permission.key,
                                    (e.target.value || null) as PermissionScope | null,
                                  )
                                }
                              >
                                <option value="">{t('roles.matrix.none')}</option>
                                {SCOPES.map((scope) => {
                                  const allowed = locked || canGrant(mine, permission.key, current, scope)
                                  return (
                                    <option key={scope} value={scope} disabled={!allowed}>
                                      {allowed
                                        ? t(`roles.scope.${scope}`)
                                        : t('roles.matrix.scopeBeyond', { scope: t(`roles.scope.${scope}`) })}
                                    </option>
                                  )
                                })}
                              </NativeSelect>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {draft.failure && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">
            {t('roles.matrix.saveFailed', { role: roleName(draft.failure.role) })}
          </p>
          <FormError error={draft.failure.error} />
        </div>
      )}
      {draft.savedCount !== null && draft.changeCount === 0 && !draft.failure && (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertDescription>{t('roles.matrix.saved')}</AlertDescription>
        </Alert>
      )}

      {draft.changeCount > 0 && (
        <div
          className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/60 bg-card p-3 shadow-lg"
          role="status"
        >
          <span className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-warning" aria-hidden />
            {t('roles.matrix.unsaved', {
              count: draft.changeCount,
              roles: formatList(
                [...draft.changes.keys()]
                  .map((id) => roles.find((r) => r.id === id))
                  .filter((r): r is RoleDto => !!r)
                  .map(roleName),
              ),
            })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={draft.saving} onClick={() => draft.discard()}>
              <Undo2Icon />
              {t('roles.matrix.discard')}
            </Button>
            <Button size="sm" disabled={draft.saving} onClick={() => void draft.save()}>
              <SaveIcon />
              {draft.saving ? t('common.saving') : t('roles.matrix.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
