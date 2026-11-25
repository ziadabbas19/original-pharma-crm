import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProductLinesList, useUsersSetProductLines, useUsersUpdate } from '@/api/generated/endpoints'
import type { TerritoryDto, UserListItemDto } from '@/api/generated/model'
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
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission, usePermissionScope } from '@/features/auth/usePermission'
import { bestLevel, invalidateRoleData, reportsOf } from '@/features/roles/role-rules'
import { flattenTerritories } from '@/features/territories/territory-tree'
import { inlineErrors, useFormErrors } from '@/lib/errors'
import { localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { Field } from './CreateUserDialog'
import { ManagerSelect } from './ManagerSelect'
import { initialLineChoice, lineChoiceMissing, lineIdsToSave, sameLineIds } from './product-line-choice'
import { ProductLinesField } from './ProductLinesField'

/** Fields that can carry a server validation message. */
const USERS_EDIT_FIELDS = ['fullName', 'managerId', 'territoryId']

/**
 * Profile and reporting line of one user (roles and permissions have their own dialogs).
 * Rendered with a `key` per user so the form starts from that user's values.
 */
export function EditUserDialog({
  user,
  users,
  territories,
  onClose,
}: {
  user: UserListItemDto
  users: UserListItemDto[]
  territories: TerritoryDto[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const update = useUsersUpdate(inlineErrors)
  const errors = useFormErrors(USERS_EDIT_FIELDS, 'users.edit')
  const manageScope = usePermissionScope(P.users.manage)
  const territoryOptions = useMemo(
    () => flattenTerritories(territories).filter((x) => x.level !== 'town'),
    [territories],
  )
  const canReadProducts = usePermission(P.products.read)
  const productLines = useProductLinesList(undefined, { query: { enabled: canReadProducts } })
  const saveLines = useUsersSetProductLines(inlineErrors)
  const savedLineIds = user.productLineIds ?? []
  const [initialLines] = useState(() => initialLineChoice(user.productLineIds))
  const [lines, setLines] = useState(initialLines)
  const [linesMissing, setLinesMissing] = useState(false)
  const linesChanged = lines.all !== initialLines.all || !sameLineIds(lines.lineIds, initialLines.lineIds)
  const userLevel = bestLevel(user.roles)
  const reports = useMemo(() => reportsOf(users, user.id), [users, user.id])

  const form = useForm({
    defaultValues: {
      fullName: user.fullName,
      preferredLanguage: user.preferredLanguage,
      territoryId: user.territoryId ?? '',
      managerId: user.managerId ?? '',
    },
    onSubmit: async ({ value }) => {
      errors.clear()
      if (lineChoiceMissing(lines)) {
        setLinesMissing(true)
        return
      }
      try {
        await update.mutateAsync({
          userId: user.id,
          data: {
            fullName: value.fullName.trim(),
            preferredLanguage: value.preferredLanguage,
            territoryId: value.territoryId || null,
            managerId: value.managerId || null,
          },
        })
        const lineIds = lineIdsToSave(lines)
        if (!sameLineIds(lineIds, savedLineIds)) {
          await saveLines.mutateAsync({ userId: user.id, data: { productLineIds: lineIds } })
        }
        await invalidateRoleData(queryClient)
        onClose()
      } catch (e) {
        errors.capture(e)
      }
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('users.edit.title', { name: user.fullName })}</DialogTitle>
          <DialogDescription>{t('users.edit.description')}</DialogDescription>
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
                  id="edit-user-name"
                  errors={[...field.state.meta.errors, ...errors.fieldList('fullName')]}
                >
                  <Input
                    id="edit-user-name"
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="preferredLanguage">
              {(field) => (
                <Field label={t('users.create.language')} id="edit-user-language">
                  <NativeSelect
                    id="edit-user-language"
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
                  manageScope === 'territory' && !value ? t('users.create.territoryRequired') : undefined,
              }}
            >
              {(field) => (
                <Field
                  label={t('users.area')}
                  id="edit-user-territory"
                  errors={[...field.state.meta.errors, ...errors.fieldList('territoryId')]}
                >
                  <NativeSelect
                    id="edit-user-territory"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    <option value="">{t('users.create.noTerritory')}</option>
                    {territoryOptions.map((territory) => (
                      <option key={territory.id} value={territory.id}>
                        {'  '.repeat(territory.depth)}
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
                onChange: ({ value }) => {
                  if (!value) return manageScope === 'team' ? t('users.create.managerRequired') : undefined
                  const manager = users.find((u) => u.id === value)
                  if (reports.has(value)) return t('errors.manager_cycle')
                  if (manager && bestLevel(manager.roles) >= userLevel)
                    return t('errors.manager_level_invalid')
                  return undefined
                },
              }}
            >
              {(field) => (
                <Field
                  label={t('users.manager')}
                  id="edit-user-manager"
                  hint={t('users.reporting.hint')}
                  errors={[...field.state.meta.errors, ...errors.fieldList('managerId')]}
                >
                  <ManagerSelect
                    id="edit-user-manager"
                    value={field.state.value}
                    onChange={field.handleChange}
                    users={users}
                    userId={user.id}
                    userLevel={userLevel}
                    invalid={field.state.meta.errors.length > 0}
                  />
                </Field>
              )}
            </form.Field>
          </div>

          {canReadProducts && (productLines.data ?? []).length > 0 && (
            <ProductLinesField
              idPrefix="edit-user-line"
              lines={productLines.data ?? []}
              value={lines}
              onChange={(value) => {
                setLines(value)
                setLinesMissing(false)
              }}
              error={linesMissing ? t('users.productLinesAtLeastOne') : null}
            />
          )}

          <FormError error={errors.formError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting, s.isDirty] as const}>
              {([canSubmit, isSubmitting, isDirty]) => (
                <Button type="submit" disabled={!(isDirty || linesChanged) || !canSubmit || isSubmitting}>
                  {isSubmitting ? t('common.saving') : t('common.save')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
