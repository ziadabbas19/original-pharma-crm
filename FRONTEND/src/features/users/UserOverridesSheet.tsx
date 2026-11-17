import { useQueryClient } from '@tanstack/react-query'
import { InfoIcon, LockIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getUsersGetPermissionOverridesQueryKey,
  useRolesListPermissions,
  useUsersGetPermissionOverrides,
  useUsersSetPermissionOverrides,
} from '@/api/generated/endpoints'
import type {
  PermissionDto,
  PermissionOverrideDto,
  PermissionScope,
  RoleDto,
  UserListItemDto,
} from '@/api/generated/model'
import { ErrorState, FormError, Spinner } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useGrantedPermissions,
  useMyRoleLevel,
  useMyUserId,
  usePermission,
} from '@/features/auth/usePermission'
import {
  groupPermissions,
  permissionLabel,
  resourceLabel,
  SCOPES,
  scopesFromRoles,
} from '@/features/roles/permission-labels'
import { canGrant, userLock } from '@/features/roles/role-rules'
import { useNow } from '@/hooks/use-now'
import { toDateInputValue } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Mode = '' | 'deny' | PermissionScope

interface Row {
  mode: Mode
  /** yyyy-MM-dd or '' (no expiry) */
  expires: string
  reason: string
}

function toRows(overrides: PermissionOverrideDto[]): Record<string, Row> {
  return Object.fromEntries(
    overrides.map((o) => [
      o.key,
      {
        mode: o.isGranted ? (o.scope ?? 'own') : 'deny',
        expires: o.expiresAt ? toDateInputValue(new Date(o.expiresAt)) : '',
        reason: o.reason ?? '',
      } satisfies Row,
    ]),
  )
}

/** End of the chosen local day, so "expires on the 20th" still applies during the 20th. */
function expiryIso(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null
}

/**
 * Per-user exceptions on top of the user's roles: grant a permission with a
 * different scope, or deny it. The API replaces the whole set on save and bumps
 * the user's permissions version, so the change applies on their next request.
 */
export function UserOverridesSheet({
  user,
  roles,
  onClose,
}: {
  user: UserListItemDto
  roles: RoleDto[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const overrides = useUsersGetPermissionOverrides(user.id)
  const permissions = useRolesListPermissions()
  const canEditRoles = usePermission(P.roles.manage)
  const canManageUsers = usePermission(P.users.manage)
  const myId = useMyUserId()
  const myLevel = useMyRoleLevel()
  const lock = userLock(user, myId, myLevel)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="end" className="sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{t('users.overrides.title', { name: user.fullName })}</SheetTitle>
          <SheetDescription>{t('users.overrides.description')}</SheetDescription>
        </SheetHeader>
        {overrides.error || permissions.error ? (
          <div className="p-4">
            <ErrorState
              error={overrides.error ?? permissions.error}
              onRetry={() => {
                void overrides.refetch()
                void permissions.refetch()
              }}
            />
          </div>
        ) : !overrides.data || !permissions.data ? (
          <Spinner />
        ) : (
          <OverridesEditor
            user={user}
            initial={overrides.data}
            permissions={permissions.data}
            inherited={scopesFromRoles(
              roles,
              user.roles.map((r) => r.key),
            )}
            canEdit={canEditRoles && canManageUsers && lock === null}
            lockReason={canEditRoles && canManageUsers && lock ? t(`roles.reason.${lock}`) : null}
            onDone={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function OverridesEditor({
  user,
  initial,
  permissions,
  inherited,
  canEdit,
  lockReason,
  onDone,
}: {
  user: UserListItemDto
  initial: PermissionOverrideDto[]
  permissions: PermissionDto[]
  inherited: Record<string, PermissionScope>
  canEdit: boolean
  lockReason: string | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useUsersSetPermissionOverrides()
  const now = useNow(60_000)
  const [rows, setRows] = useState<Record<string, Row>>(() => toRows(initial))
  const [dirty, setDirty] = useState(false)
  const groups = useMemo(() => groupPermissions(permissions), [permissions])
  const mine = useGrantedPermissions()

  // Same rule as the API: a grant you could not give yourself is only kept as it was.
  const grantAllowed = (key: string, scope: PermissionScope) => {
    const before = initial.find((o) => o.key === key && o.isGranted)?.scope ?? null
    return canGrant(mine, key, before, scope)
  }

  const update = (key: string, patch: Partial<Row>) => {
    setDirty(true)
    setRows((prev) => {
      const base: Row | undefined = prev[key]
      const next: Row = { ...(base ?? { mode: '', expires: '', reason: '' }), ...patch }
      if (next.mode === '') {
        const rest = { ...prev }
        delete rest[key]
        return rest
      }
      return { ...prev, [key]: next }
    })
  }

  const submit = async () => {
    const payload: PermissionOverrideDto[] = Object.entries(rows).map(([key, row]) => ({
      key,
      isGranted: row.mode !== 'deny',
      scope: row.mode === 'deny' ? null : (row.mode as PermissionScope),
      expiresAt: expiryIso(row.expires),
      reason: row.reason.trim() || null,
    }))
    await save.mutateAsync({ userId: user.id, data: { overrides: payload } })
    await queryClient.invalidateQueries({ queryKey: getUsersGetPermissionOverridesQueryKey(user.id) })
    onDone()
  }

  const count = Object.keys(rows).length

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('users.overrides.rules')}</AlertDescription>
        </Alert>
        {lockReason && (
          <Alert>
            <LockIcon />
            <AlertDescription>{t('users.overrides.readOnly', { reason: lockReason })}</AlertDescription>
          </Alert>
        )}

        {groups.map((group) => (
          <section key={group.resource} className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
              {resourceLabel(t, group.resource)}
            </h3>
            <div className="divide-y rounded-lg border">
              {group.items.map((permission) => {
                const row = rows[permission.key]
                const fromRoles = inherited[permission.key] ?? null
                const expired = row?.expires ? new Date(`${row.expires}T23:59:59`).getTime() < now : false
                const effective: PermissionScope | null =
                  !row || expired ? fromRoles : row.mode === 'deny' ? null : (row.mode as PermissionScope)
                const label = permissionLabel(t, permission.key, permission.description)
                return (
                  <div key={permission.key} className={cn('space-y-2 p-3', row && 'bg-warning/5')}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-40 flex-1">
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          <span dir="ltr">{permission.key}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{t('users.overrides.fromRoles')}</span>
                        <ScopeBadge scope={fromRoles} />
                        <span className="text-muted-foreground">{t('users.overrides.effective')}</span>
                        <ScopeBadge scope={effective} strong />
                      </div>
                      <NativeSelect
                        size="sm"
                        className="w-44"
                        value={row?.mode ?? ''}
                        disabled={!canEdit || save.isPending}
                        aria-label={t('users.overrides.override', { permission: label })}
                        onChange={(e) => update(permission.key, { mode: e.target.value as Mode })}
                      >
                        <option value="">{t('users.overrides.inherit')}</option>
                        {SCOPES.map((scope) => {
                          const allowed = !canEdit || grantAllowed(permission.key, scope)
                          const text = t('users.overrides.grant', { scope: t(`roles.scope.${scope}`) })
                          return (
                            <option key={scope} value={scope} disabled={!allowed}>
                              {allowed ? text : t('roles.matrix.scopeBeyond', { scope: text })}
                            </option>
                          )
                        })}
                        <option value="deny">{t('users.overrides.deny')}</option>
                      </NativeSelect>
                    </div>
                    {row && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          {t('users.overrides.expires')}
                          <Input
                            type="date"
                            className="h-8 w-40 text-sm"
                            value={row.expires}
                            disabled={!canEdit}
                            onChange={(e) => update(permission.key, { expires: e.target.value })}
                          />
                        </label>
                        {expired && <Badge variant="outline">{t('users.overrides.expired')}</Badge>}
                        <Input
                          className="h-8 min-w-48 flex-1 text-sm"
                          placeholder={t('users.overrides.reason')}
                          aria-label={t('users.overrides.reason')}
                          maxLength={256}
                          value={row.reason}
                          disabled={!canEdit}
                          onChange={(e) => update(permission.key, { reason: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        <FormError error={save.error} />
      </div>
      <SheetFooter className="items-center">
        <span className="me-auto text-sm text-muted-foreground">{t('users.overrides.count', { count })}</span>
        <Button variant="outline" onClick={onDone}>
          {canEdit ? t('common.cancel') : t('common.close')}
        </Button>
        {canEdit && (
          <Button disabled={!dirty || save.isPending} onClick={() => void submit().catch(() => {})}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        )}
      </SheetFooter>
    </>
  )
}

function ScopeBadge({ scope, strong }: { scope: PermissionScope | null; strong?: boolean }) {
  const { t } = useTranslation()
  if (!scope) return <Badge variant="outline">{t('roles.matrix.none')}</Badge>
  return <Badge variant={strong ? 'default' : 'secondary'}>{t(`roles.scope.${scope}`)}</Badge>
}
