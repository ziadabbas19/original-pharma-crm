import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { rolesDelete, rolesReassignUsers } from '@/api/generated/endpoints'
import type { RoleDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useMyRoleLevel } from '@/features/auth/usePermission'
import { handleError } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { invalidateRoleData, roleLock, roleName } from './role-rules'

/**
 * Confirms deleting a custom role. While users still hold it, a target role must be
 * chosen: the users are moved there first (one request), then the role is deleted.
 */
export function DeleteRoleDialog({
  role,
  roles,
  open,
  onOpenChange,
  onDeleted,
}: {
  role: RoleDto
  roles: RoleDto[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const myLevel = useMyRoleLevel()
  const [targetId, setTargetId] = useState('')
  const [typed, setTyped] = useState('')
  const wordOk = ['delete', 'حذف'].includes(typed.trim().toLowerCase())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const needsMove = role.userCount > 0
  const targets = roles.filter((r) => r.id !== role.id)

  const close = (value: boolean) => {
    if (!value) {
      setTargetId('')
      setTyped('')
      setError(null)
    }
    onOpenChange(value)
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      if (needsMove) await rolesReassignUsers(role.id, { targetRoleId: targetId })
      await rolesDelete(role.id)
      await invalidateRoleData(queryClient)
      close(false)
      onDeleted()
    } catch (e) {
      setError(handleError(e, { silent: true, context: 'roles.delete' }))
      // Someone may have assigned the role meanwhile: refresh the count shown above.
      await invalidateRoleData(queryClient)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('roles.delete.title', { role: roleName(role) })}</DialogTitle>
          <DialogDescription>{t('roles.delete.description')}</DialogDescription>
        </DialogHeader>

        {needsMove && (
          <div className="grid gap-3">
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                {t('roles.delete.inUse', { count: formatNumber(role.userCount) })}
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label htmlFor="delete-role-target">{t('roles.delete.moveTo')}</Label>
              <NativeSelect
                id="delete-role-target"
                value={targetId}
                disabled={busy}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">{t('roles.delete.choose')}</option>
                {targets.map((target) => {
                  const lock = roleLock(target, myLevel)
                  return (
                    <option key={target.id} value={target.id} disabled={lock !== null}>
                      {lock
                        ? t('roles.optionLocked', {
                            role: roleName(target),
                            reason: t(`roles.reason.${lock}`),
                          })
                        : t('roles.optionWithLevel', {
                            role: roleName(target),
                            level: formatNumber(target.level),
                          })}
                    </option>
                  )
                })}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t('roles.delete.moveHint')}</p>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="delete-role-word">{t('confirm.typeToConfirm', { word: t('confirm.word') })}</Label>
          <Input
            id="delete-role-word"
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            aria-invalid={typed !== '' && !wordOk}
          />
        </div>

        <FormError error={error} />

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => close(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || (needsMove && !targetId) || !wordOk}
            onClick={() => void confirm()}
          >
            {busy
              ? t('roles.delete.deleting')
              : needsMove
                ? t('roles.delete.moveAndDelete')
                : t('roles.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
