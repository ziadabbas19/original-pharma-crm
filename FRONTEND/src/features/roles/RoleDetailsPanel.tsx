import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2Icon, CopyIcon, InfoIcon, LockIcon, SaveIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRolesUpdate } from '@/api/generated/endpoints'
import type { RoleDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useGrantedPermissions, useMyRoleLevel } from '@/features/auth/usePermission'
import { fieldErrors } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { DeleteRoleDialog } from './DeleteRoleDialog'
import { DESCRIPTION_MAX, levelError, nameError } from './role-form'
import {
  grantsBeyond,
  invalidateRoleData,
  MAX_LEVEL,
  minAssignableLevel,
  roleLock,
  roleName,
} from './role-rules'
import { LevelBadge, LockedNote, SystemBadge } from './RoleBadges'
import { Errors, TextField } from './RoleFormFields'
import type { PermissionDraft } from './usePermissionDraft'

function formValues(role: RoleDto) {
  return {
    nameAr: role.nameAr,
    nameEn: role.nameEn,
    description: role.description ?? '',
    level: String(role.level),
  }
}

/**
 * Edit one role: names in both languages, description and level, plus "copy permissions
 * from another role" (fills the matrix draft) and delete. Render with `key={role.id}`.
 */
export function RoleDetailsPanel({
  role,
  roles,
  canManage,
  draft,
  onDeleted,
}: {
  role: RoleDto
  roles: RoleDto[]
  canManage: boolean
  draft: PermissionDraft
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const update = useRolesUpdate()
  const myLevel = useMyRoleLevel()
  const mine = useGrantedPermissions()
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copySource, setCopySource] = useState('')

  const lock = roleLock(role, myLevel)
  const editable = canManage && lock === null
  const minLevel = minAssignableLevel(myLevel)

  const form = useForm({
    defaultValues: formValues(role),
    onSubmit: async ({ value }) => {
      setError(null)
      setSaved(false)
      try {
        const updated = await update.mutateAsync({
          roleId: role.id,
          data: {
            nameAr: value.nameAr.trim(),
            nameEn: value.nameEn.trim(),
            description: value.description.trim() || null,
            level: Number(value.level),
          },
        })
        form.reset(formValues(updated))
        setSaved(true)
        await invalidateRoleData(queryClient)
      } catch (e) {
        setError(e)
      }
    },
  })

  const server = fieldErrors(error)
  const copyOptions = roles.filter((r) => r.id !== role.id)
  const source = copyOptions.find((r) => r.id === copySource)

  return (
    <Card className="min-w-0 gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{roleName(role)}</CardTitle>
          <LevelBadge level={role.level} />
          {role.isSystem && <SystemBadge />}
          <span className="text-sm text-muted-foreground">{t('roles.users', { count: role.userCount })}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('roles.details.key')}{' '}
          <code dir="ltr" className="rounded bg-muted px-1 py-0.5">
            {role.key}
          </code>{' '}
          · {t('roles.details.keyHint')}
        </p>
      </CardHeader>

      <CardContent className="grid gap-4">
        {role.permissionsLocked && (
          <Alert>
            <InfoIcon />
            <AlertDescription>{t('roles.adminLockedHint')}</AlertDescription>
          </Alert>
        )}
        {canManage && lock && (
          <Alert>
            <LockIcon />
            <AlertDescription>
              {t('roles.details.readOnly', { reason: t(`roles.reason.${lock}`) })}
            </AlertDescription>
          </Alert>
        )}

        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="nameAr" validators={{ onBlur: ({ value }) => nameError(value, t) }}>
              {(field) => (
                <TextField
                  id={`role-${field.name}`}
                  label={t('roles.form.nameAr')}
                  dir="rtl"
                  value={field.state.value}
                  disabled={!editable}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  errors={[...field.state.meta.errors, ...(server.nameAr ?? [])]}
                />
              )}
            </form.Field>
            <form.Field name="nameEn" validators={{ onBlur: ({ value }) => nameError(value, t) }}>
              {(field) => (
                <TextField
                  id={`role-${field.name}`}
                  label={t('roles.form.nameEn')}
                  dir="ltr"
                  value={field.state.value}
                  disabled={!editable}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  errors={[...field.state.meta.errors, ...(server.nameEn ?? [])]}
                />
              )}
            </form.Field>
          </div>

          <form.Field
            name="description"
            validators={{
              onBlur: ({ value }) =>
                value.length > DESCRIPTION_MAX ? t('forms.maxLength', { count: DESCRIPTION_MAX }) : undefined,
            }}
          >
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="role-description">{t('roles.form.description')}</Label>
                <Textarea
                  id="role-description"
                  rows={2}
                  value={field.state.value}
                  disabled={!editable}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <Errors messages={[...field.state.meta.errors, ...(server.description ?? [])]} />
              </div>
            )}
          </form.Field>

          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <form.Field
              name="level"
              validators={{
                onBlur: ({ value }) =>
                  role.permissionsLocked || value === String(role.level)
                    ? undefined
                    : levelError(value, minLevel, t),
              }}
            >
              {(field) => (
                <div className="grid content-start gap-2">
                  <Label htmlFor="role-level">{t('roles.form.level')}</Label>
                  <Input
                    id="role-level"
                    type="number"
                    inputMode="numeric"
                    min={minLevel}
                    max={MAX_LEVEL}
                    step={1}
                    dir="ltr"
                    value={field.state.value}
                    disabled={!editable || role.permissionsLocked}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <Errors messages={[...field.state.meta.errors, ...(server.level ?? [])]} />
                </div>
              )}
            </form.Field>
            <p className="self-center text-xs text-muted-foreground">
              {role.permissionsLocked
                ? t('roles.form.levelLocked')
                : t('roles.form.levelHelp', { min: formatNumber(minLevel) })}
            </p>
          </div>

          <FormError error={error} />

          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting, s.isDirty] as const}>
                {([canSubmit, isSubmitting, isDirty]) => (
                  <>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!editable || !isDirty || !canSubmit || isSubmitting}
                    >
                      <SaveIcon />
                      {isSubmitting ? t('common.saving') : t('roles.details.save')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!isDirty || isSubmitting}
                      onClick={() => {
                        form.reset(formValues(role))
                        setError(null)
                      }}
                    >
                      <Undo2Icon />
                      {t('roles.details.reset')}
                    </Button>
                    {isDirty ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-2 rounded-full bg-warning" aria-hidden />
                        {t('roles.details.unsaved')}
                      </span>
                    ) : (
                      saved && (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2Icon className="size-3.5" aria-hidden />
                          {t('roles.details.saved')}
                        </span>
                      )
                    )}
                  </>
                )}
              </form.Subscribe>
              <span className="flex-1" />
              {role.isSystem ? (
                <LockedNote reason={t('roles.reason.system')} />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={!editable}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2Icon />
                  {t('roles.details.delete')}
                </Button>
              )}
            </div>
          )}
        </form>

        {canManage && editable && !role.permissionsLocked && (
          <>
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="role-copy-source">{t('roles.copy.title')}</Label>
              <div className="flex flex-wrap gap-2">
                <NativeSelect
                  id="role-copy-source"
                  className="min-w-48 flex-1"
                  value={copySource}
                  onChange={(e) => setCopySource(e.target.value)}
                >
                  <option value="">{t('roles.copy.choose')}</option>
                  {copyOptions.map((option) => {
                    const blocked = grantsBeyond(mine, option.permissions, role.permissions).length > 0
                    return (
                      <option key={option.id} value={option.id} disabled={blocked}>
                        {blocked
                          ? t('roles.copy.optionBlocked', { role: roleName(option) })
                          : roleName(option)}
                      </option>
                    )
                  })}
                </NativeSelect>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!source || draft.saving}
                  onClick={() => {
                    if (!source) return
                    draft.replaceRole(role, source.permissions)
                    setCopySource('')
                  }}
                >
                  <CopyIcon />
                  {t('roles.copy.apply')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('roles.copy.hint')}</p>
            </div>
          </>
        )}
      </CardContent>

      {canManage && !role.isSystem && (
        <DeleteRoleDialog
          role={role}
          roles={roles}
          open={deleting}
          onOpenChange={setDeleting}
          onDeleted={onDeleted}
        />
      )}
    </Card>
  )
}
