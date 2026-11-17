import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRoundIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useUsersCreate } from '@/api/generated/endpoints'
import type { RoleDto, TerritoryDto, UserListItemDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useMyRoleLevel, usePermissionScope } from '@/features/auth/usePermission'
import { LevelBadge, LockedNote } from '@/features/roles/RoleBadges'
import { bestLevel, invalidateRoleData, roleLock, roleName } from '@/features/roles/role-rules'
import { flattenTerritories } from '@/features/territories/territory-tree'
import { fieldErrors } from '@/lib/errors'
import { localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { ManagerSelect } from './ManagerSelect'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') + '!7'
}

export function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  territories,
  users,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RoleDto[]
  territories: TerritoryDto[]
  users: UserListItemDto[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const create = useUsersCreate()
  const [error, setError] = useState<unknown>(null)
  // The API only accepts new users inside the creator's scope.
  const manageScope = usePermissionScope(P.users.manage)
  const territoryRequired = manageScope === 'territory'
  const managerRequired = manageScope === 'team'

  const territoryOptions = useMemo(() => flattenTerritories(territories), [territories])
  const myLevel = useMyRoleLevel()

  const form = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      roles: [] as string[],
      territoryId: '',
      managerId: '',
      preferredLanguage: 'ar',
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await create.mutateAsync({
          data: {
            fullName: value.fullName.trim(),
            email: value.email.trim(),
            password: value.password,
            roles: value.roles,
            territoryId: value.territoryId || null,
            managerId: value.managerId || null,
            preferredLanguage: value.preferredLanguage,
          },
        })
        await invalidateRoleData(queryClient)
        form.reset()
        onOpenChange(false)
      } catch (e) {
        setError(e)
      }
    },
  })

  const server = fieldErrors(error)

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('users.create.title')}</DialogTitle>
          <DialogDescription>{t('users.create.description')}</DialogDescription>
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
            <form.Field
              name="fullName"
              validators={{
                onBlur: ({ value }) =>
                  !value.trim()
                    ? t('forms.required')
                    : value.length > 200
                      ? t('forms.maxLength', { count: 200 })
                      : undefined,
              }}
            >
              {(field) => (
                <Field
                  label={t('users.name')}
                  id={field.name}
                  errors={[...field.state.meta.errors, ...(server.fullName ?? [])]}
                >
                  <Input
                    id={field.name}
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) =>
                  !value.trim()
                    ? t('forms.required')
                    : !EMAIL.test(value.trim())
                      ? t('auth.invalidEmail')
                      : undefined,
              }}
            >
              {(field) => (
                <Field
                  label={t('users.email')}
                  id={field.name}
                  errors={[...field.state.meta.errors, ...(server.email ?? [])]}
                >
                  <Input
                    id={field.name}
                    type="email"
                    dir="ltr"
                    autoComplete="off"
                    inputMode="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onBlur: ({ value }) =>
                  value.length < 8
                    ? t('users.create.passwordRule')
                    : value.length > 128
                      ? t('forms.maxLength', { count: 128 })
                      : undefined,
              }}
            >
              {(field) => (
                <Field
                  label={t('auth.password')}
                  id={field.name}
                  hint={t('users.create.passwordHint')}
                  errors={[...field.state.meta.errors, ...(server.password ?? [])]}
                >
                  <div className="flex gap-2">
                    <Input
                      id={field.name}
                      type="text"
                      dir="ltr"
                      autoComplete="new-password"
                      spellCheck={false}
                      className="font-mono"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        field.handleChange(generatePassword())
                        field.handleBlur()
                      }}
                    >
                      <KeyRoundIcon />
                      {t('users.create.generate')}
                    </Button>
                  </div>
                </Field>
              )}
            </form.Field>

            <form.Field name="preferredLanguage">
              {(field) => (
                <Field label={t('users.create.language')} id={field.name}>
                  <NativeSelect
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </NativeSelect>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="territoryId"
              validators={{
                onSubmit: ({ value }) =>
                  territoryRequired && !value ? t('users.create.territoryRequired') : undefined,
              }}
            >
              {(field) => (
                <Field
                  label={t('users.territory')}
                  id={field.name}
                  errors={[...field.state.meta.errors, ...(server.territoryId ?? [])]}
                >
                  <NativeSelect
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  >
                    <option value="">{t('users.create.noTerritory')}</option>
                    {territoryOptions.map((territory) => (
                      <option key={territory.id} value={territory.id}>
                        {'  '.repeat(territory.depth)}
                        {localizedName(territory.name, territory.nameAr)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="managerId"
              validators={{
                onSubmit: ({ value, fieldApi }) => {
                  if (!value) return managerRequired ? t('users.create.managerRequired') : undefined
                  const manager = users.find((u) => u.id === value)
                  const level = bestLevel(
                    roles.filter((r) => fieldApi.form.getFieldValue('roles').includes(r.key)),
                  )
                  return manager && bestLevel(manager.roles) >= level
                    ? t('errors.manager_level_invalid')
                    : undefined
                },
              }}
            >
              {(field) => (
                <Field
                  label={t('users.manager')}
                  id={field.name}
                  hint={t('users.reporting.hint')}
                  errors={[...field.state.meta.errors, ...(server.managerId ?? [])]}
                >
                  <form.Subscribe selector={(s) => s.values.roles}>
                    {(selectedRoles) => (
                      <ManagerSelect
                        id={field.name}
                        value={field.state.value}
                        onChange={field.handleChange}
                        users={users}
                        userLevel={bestLevel(roles.filter((r) => selectedRoles.includes(r.key)))}
                        invalid={field.state.meta.errors.length > 0}
                      />
                    )}
                  </form.Subscribe>
                </Field>
              )}
            </form.Field>
          </div>

          <form.Field
            name="roles"
            validators={{
              onSubmit: ({ value }) => (value.length === 0 ? t('users.rolesDialog.atLeastOne') : undefined),
            }}
          >
            {(field) => (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">{t('users.roles')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map((role) => {
                    const id = `new-user-role-${role.id}`
                    const checked = field.state.value.includes(role.key)
                    const lock = roleLock(role, myLevel)
                    return (
                      <div key={role.id} className="flex items-start gap-3 rounded-md border p-2.5">
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={lock !== null}
                          onCheckedChange={(value) =>
                            field.handleChange(
                              value === true
                                ? [...field.state.value, role.key]
                                : field.state.value.filter((r) => r !== role.key),
                            )
                          }
                        />
                        <Label htmlFor={id} className="grid gap-0.5 font-normal">
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
                {[...field.state.meta.errors, ...(server.roles ?? [])].length > 0 && (
                  <p className="text-sm text-destructive">
                    {[...field.state.meta.errors, ...(server.roles ?? [])].join(' ')}
                  </p>
                )}
              </fieldset>
            )}
          </form.Field>

          {(territoryRequired || managerRequired) && (
            <p className="text-xs text-muted-foreground">
              {territoryRequired ? t('users.create.scopeTerritoryHint') : t('users.create.scopeTeamHint')}
            </p>
          )}

          <FormError error={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? t('common.saving') : t('users.create.submit')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  id,
  hint,
  errors = [],
  children,
}: {
  label: string
  id: string
  hint?: string
  errors?: unknown[]
  children: ReactNode
}) {
  const messages = errors.filter(Boolean).map(String)
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && messages.length === 0 && <p className="text-xs text-muted-foreground">{hint}</p>}
      {messages.length > 0 && <p className="text-sm text-destructive">{messages.join(' ')}</p>}
    </div>
  )
}
