import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRolesCreate } from '@/api/generated/endpoints'
import type { RoleDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
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
import { Textarea } from '@/components/ui/textarea'
import { useGrantedPermissions, useMyRoleLevel } from '@/features/auth/usePermission'
import { fieldErrors } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { DESCRIPTION_MAX, levelError, nameError } from './role-form'
import { Errors, TextField } from './RoleFormFields'
import {
  defaultLevelBelow,
  grantsBeyond,
  invalidateRoleData,
  MAX_LEVEL,
  minAssignableLevel,
  roleName,
} from './role-rules'

export function CreateRoleDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RoleDto[]
  onCreated: (role: RoleDto) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const create = useRolesCreate()
  const mine = useGrantedPermissions()
  const myLevel = useMyRoleLevel()
  const minLevel = minAssignableLevel(myLevel)
  const [error, setError] = useState<unknown>(null)

  const form = useForm({
    defaultValues: {
      nameAr: '',
      nameEn: '',
      description: '',
      level: String(defaultLevelBelow(myLevel)),
      copyFrom: '',
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const role = await create.mutateAsync({
          data: {
            nameAr: value.nameAr.trim(),
            nameEn: value.nameEn.trim(),
            description: value.description.trim() || null,
            level: Number(value.level),
            copyFromRoleId: value.copyFrom || null,
          },
        })
        await invalidateRoleData(queryClient)
        form.reset()
        onOpenChange(false)
        onCreated(role)
      } catch (e) {
        setError(e)
      }
    },
  })

  const server = fieldErrors(error)
  const nameRule = (value: string) => nameError(value, t)

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          form.reset()
          setError(null)
        }
        onOpenChange(value)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('roles.create.title')}</DialogTitle>
          <DialogDescription>{t('roles.create.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="nameAr" validators={{ onBlur: ({ value }) => nameRule(value) }}>
              {(field) => (
                <TextField
                  id={field.name}
                  label={t('roles.form.nameAr')}
                  dir="rtl"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  errors={[...field.state.meta.errors, ...(server.nameAr ?? [])]}
                />
              )}
            </form.Field>
            <form.Field name="nameEn" validators={{ onBlur: ({ value }) => nameRule(value) }}>
              {(field) => (
                <TextField
                  id={field.name}
                  label={t('roles.form.nameEn')}
                  dir="ltr"
                  value={field.state.value}
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
                <Label htmlFor={field.name}>{t('roles.form.description')}</Label>
                <Textarea
                  id={field.name}
                  rows={2}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <Errors messages={[...field.state.meta.errors, ...(server.description ?? [])]} />
              </div>
            )}
          </form.Field>

          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <form.Field name="level" validators={{ onBlur: ({ value }) => levelError(value, minLevel, t) }}>
              {(field) => (
                <div className="grid content-start gap-2">
                  <Label htmlFor={field.name}>{t('roles.form.level')}</Label>
                  <Input
                    id={field.name}
                    type="number"
                    inputMode="numeric"
                    min={minLevel}
                    max={MAX_LEVEL}
                    step={1}
                    dir="ltr"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <Errors messages={[...field.state.meta.errors, ...(server.level ?? [])]} />
                </div>
              )}
            </form.Field>
            <p className="self-center text-xs text-muted-foreground">
              {t('roles.form.levelHelp', { min: formatNumber(minLevel) })}
            </p>
          </div>

          <form.Field name="copyFrom">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>{t('roles.create.copyFrom')}</Label>
                <NativeSelect
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                >
                  <option value="">{t('roles.create.startEmpty')}</option>
                  {roles.map((role) => {
                    const blocked = grantsBeyond(mine, role.permissions).length > 0
                    return (
                      <option key={role.id} value={role.id} disabled={blocked}>
                        {blocked ? t('roles.copy.optionBlocked', { role: roleName(role) }) : roleName(role)}
                      </option>
                    )
                  })}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{t('roles.create.copyHint')}</p>
              </div>
            )}
          </form.Field>

          <FormError error={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? t('common.saving') : t('roles.create.submit')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
