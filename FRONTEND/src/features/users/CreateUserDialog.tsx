import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useProductLinesList, useUsersCreate } from '@/api/generated/endpoints'
import type { CreatedUserDto, RoleSummaryDto, TerritoryDto, UserListItemDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { useMyRoleLevel, usePermission, usePermissionScope } from '@/features/auth/usePermission'
import { passwordProblems } from '@/features/profile/password-rules'
import { LevelBadge, LockedNote } from '@/features/roles/RoleBadges'
import { bestLevel, invalidateRoleData, roleLock, roleName } from '@/features/roles/role-rules'
import { flattenTerritories } from '@/features/territories/territory-tree'
import { fieldErrors } from '@/lib/errors'
import { localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { ManagerSelect } from './ManagerSelect'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Role choices for a new account (from the roles list or /api/users/assignable-roles). */
export type RoleOption = RoleSummaryDto & { description?: string | null }

export function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  territories,
  users,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RoleOption[]
  territories: TerritoryDto[]
  users: UserListItemDto[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const create = useUsersCreate()
  const [error, setError] = useState<unknown>(null)
  const [created, setCreated] = useState<CreatedUserDto | null>(null)
  const [copied, setCopied] = useState(false)
  const canReadProducts = usePermission(P.products.read)
  const productLines = useProductLinesList(undefined, { query: { enabled: open && canReadProducts } })
  // The API only accepts new users inside the creator's scope.
  const manageScope = usePermissionScope(P.users.create)
  const territoryRequired = manageScope === 'territory'
  const managerRequired = manageScope === 'team'

  // Users work in an area (managers in a region); towns are for doctors.
  const territoryOptions = useMemo(
    () => flattenTerritories(territories).filter((x) => x.level !== 'town'),
    [territories],
  )
  const myLevel = useMyRoleLevel()

  const form = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      passwordMode: 'generate' as 'generate' | 'set',
      password: '',
      roles: [] as string[],
      productLineIds: [] as string[],
      territoryId: '',
      managerId: '',
      preferredLanguage: 'ar',
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const result = await create.mutateAsync({
          data: {
            fullName: value.fullName.trim(),
            email: value.email.trim(),
            password: value.passwordMode === 'set' ? value.password : null,
            roles: value.roles,
            territoryId: value.territoryId || null,
            managerId: value.managerId || null,
            preferredLanguage: value.preferredLanguage,
            productLineIds: value.productLineIds,
          },
        })
        await invalidateRoleData(queryClient)
        form.reset()
        if (result.temporaryPassword) setCreated(result)
        else onOpenChange(false)
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
          setCreated(null)
          setCopied(false)
        }
        onOpenChange(value)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('users.create.title')}</DialogTitle>
          <DialogDescription>{t('users.create.description')}</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="grid gap-4">
            <Alert variant="success">
              <CheckIcon />
              <AlertTitle>{t('users.create.created', { name: created.user.fullName })}</AlertTitle>
              <AlertDescription>{t('users.create.temporaryShownOnce')}</AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-base select-all"
              >
                {created.temporaryPassword}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(created.temporaryPassword ?? '')
                    .then(() => setCopied(true))
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? t('users.create.copied') : t('users.create.copy')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t('users.create.mustChangeHint')}</p>
            <DialogFooter>
              <Button
                onClick={() => {
                  setCreated(null)
                  setCopied(false)
                  onOpenChange(false)
                }}
              >
                {t('common.done')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
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

              <form.Subscribe selector={(state) => state.values.passwordMode}>
                {(mode) => (
                  <div className="grid gap-2">
                    <span className="text-sm font-medium">{t('users.create.passwordTitle')}</span>
                    <form.Field name="passwordMode">
                      {(field) => (
                        <div
                          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
                          role="radiogroup"
                          aria-label={t('users.create.passwordTitle')}
                        >
                          {(['generate', 'set'] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={field.state.value === value}
                              onClick={() => field.handleChange(value)}
                              className={
                                field.state.value === value
                                  ? 'rounded-md bg-background py-1.5 text-xs font-medium shadow-xs'
                                  : 'rounded-md py-1.5 text-xs font-medium text-muted-foreground'
                              }
                            >
                              {t(`users.create.passwordModes.${value}`)}
                            </button>
                          ))}
                        </div>
                      )}
                    </form.Field>
                    {mode === 'generate' ? (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" />
                        {t('users.create.generateHint')}
                      </p>
                    ) : (
                      <form.Field
                        name="password"
                        validators={{
                          onBlur: ({ value }) =>
                            passwordProblems(value).length > 0 ? t('users.create.passwordRule') : undefined,
                          onSubmit: ({ value }) =>
                            passwordProblems(value).length > 0 ? t('users.create.passwordRule') : undefined,
                        }}
                      >
                        {(field) => (
                          <Field
                            label={t('auth.password')}
                            id={field.name}
                            errors={[...field.state.meta.errors, ...(server.password ?? [])]}
                          >
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
                          </Field>
                        )}
                      </form.Field>
                    )}
                  </div>
                )}
              </form.Subscribe>

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
                    label={t('users.area')}
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

            {canReadProducts && (productLines.data ?? []).length > 0 && (
              <form.Field name="productLineIds">
                {(field) => (
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm font-medium">{t('users.productLines')}</legend>
                    <p className="text-xs text-muted-foreground">{t('users.productLinesHint')}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(productLines.data ?? []).map((line) => {
                        const id = `new-user-line-${line.id}`
                        return (
                          <Label
                            key={line.id}
                            htmlFor={id}
                            className="flex items-center gap-2 rounded-md border p-2.5 font-normal"
                          >
                            <Checkbox
                              id={id}
                              checked={field.state.value.includes(line.id)}
                              onCheckedChange={(v) =>
                                field.handleChange(
                                  v === true
                                    ? [...field.state.value, line.id]
                                    : field.state.value.filter((x) => x !== line.id),
                                )
                              }
                            />
                            {localizedName(line.nameEn, line.nameAr)}
                          </Label>
                        )
                      })}
                    </div>
                  </fieldset>
                )}
              </form.Field>
            )}

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
        )}
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
