import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUsersSetRoles } from '@/api/generated/endpoints'
import type { RoleDto, UserListItemDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useMyRoleLevel } from '@/features/auth/usePermission'
import { LevelBadge, LockedNote } from '@/features/roles/RoleBadges'
import { bestLevel, invalidateRoleData, roleLock, roleName } from '@/features/roles/role-rules'
import { inlineErrors } from '@/lib/errors'

/**
 * Assign roles to one user. Roles at or above your own level are shown but cannot be
 * added or removed. Rendered with a `key` per user so the selection starts fresh.
 */
export function UserRolesDialog({
  user,
  roles,
  users,
  onClose,
}: {
  user: UserListItemDto
  roles: RoleDto[]
  users: UserListItemDto[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const setRoles = useUsersSetRoles(inlineErrors)
  const myLevel = useMyRoleLevel()
  const [selected, setSelected] = useState<string[]>(user.roles.map((r) => r.key))

  const toggle = (key: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)))

  // The API refuses a change that breaks the reporting line; say so before saving.
  const newLevel = bestLevel(roles.filter((r) => selected.includes(r.key)))
  const manager = users.find((u) => u.id === user.managerId)
  const managerBlocks = manager !== undefined && selected.length > 0 && bestLevel(manager.roles) >= newLevel
  const reportsBlock =
    selected.length > 0 && users.some((u) => u.managerId === user.id && newLevel >= bestLevel(u.roles))

  const save = async () => {
    await setRoles.mutateAsync({ userId: user.id, data: { roles: selected } })
    await invalidateRoleData(queryClient)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.rolesDialog.title', { name: user.fullName })}</DialogTitle>
          <DialogDescription>{t('users.rolesDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {roles.map((role) => {
            const id = `role-${role.id}`
            const lock = roleLock(role, myLevel)
            return (
              <div key={role.id} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id={id}
                  checked={selected.includes(role.key)}
                  disabled={lock !== null}
                  onCheckedChange={(checked) => toggle(role.key, checked === true)}
                />
                <Label htmlFor={id} className="grid flex-1 gap-0.5 font-normal">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    {roleName(role)}
                    <LevelBadge level={role.level} />
                  </span>
                  {role.description && (
                    <span className="text-xs text-muted-foreground">{role.description}</span>
                  )}
                  {lock && <LockedNote reason={t(`roles.reason.${lock}`)} />}
                </Label>
              </div>
            )
          })}
        </div>

        {selected.length === 0 && (
          <p className="text-sm text-destructive">{t('users.rolesDialog.atLeastOne')}</p>
        )}
        {(managerBlocks || reportsBlock) && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              {managerBlocks
                ? t('users.rolesDialog.managerRank', { manager: manager.fullName })
                : t('users.rolesDialog.reportsRank')}
            </AlertDescription>
          </Alert>
        )}
        <FormError error={setRoles.error} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={selected.length === 0 || managerBlocks || reportsBlock || setRoles.isPending}
            onClick={() => void save().catch(() => {})}
          >
            {setRoles.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
