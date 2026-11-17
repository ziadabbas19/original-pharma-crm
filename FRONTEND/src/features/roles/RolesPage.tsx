import { ListTreeIcon, PlusIcon, ShieldCheckIcon, TableIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRolesList, useRolesListPermissions } from '@/api/generated/endpoints'
import type { RoleDto } from '@/api/generated/model'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMyRoleLevel, usePermission } from '@/features/auth/usePermission'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { CreateRoleDialog } from './CreateRoleDialog'
import { HierarchyView } from './HierarchyView'
import { SCOPES } from './permission-labels'
import { PermissionMatrix } from './PermissionMatrix'
import { RecentChanges } from './RecentChanges'
import { RoleDetailsPanel } from './RoleDetailsPanel'
import { RoleList } from './RoleList'
import { roleLock } from './role-rules'
import { usePermissionDraft } from './usePermissionDraft'

type View = 'roles' | 'hierarchy'

export function RolesPage() {
  const { t } = useTranslation()
  const canManage = usePermission(P.roles.manage)
  const myLevel = useMyRoleLevel()
  const myRoles = useAppSelector((s) => s.auth.user?.roles)
  const roles = useRolesList()
  const permissions = useRolesListPermissions()
  const draft = usePermissionDraft(roles.data)
  const [view, setView] = useState<View>('roles')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loading = roles.isLoading || permissions.isLoading
  const error = roles.error ?? permissions.error

  // Default to the first role you can edit, so the panel opens on something useful.
  const selected: RoleDto | undefined =
    roles.data?.find((r) => r.id === selectedId) ??
    roles.data?.find((r) => !r.permissionsLocked && roleLock(r, myLevel) === null) ??
    roles.data?.[0]

  const select = (roleId: string) => {
    setSelectedId(roleId)
    setView('roles')
  }

  return (
    <>
      <PageHeader
        title={t('roles.title')}
        description={t('roles.hint')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-md border bg-card p-0.5"
              role="group"
              aria-label={t('roles.view.label')}
            >
              <ViewButton active={view === 'roles'} icon={TableIcon} onClick={() => setView('roles')}>
                {t('roles.view.roles')}
              </ViewButton>
              <ViewButton
                active={view === 'hierarchy'}
                icon={ListTreeIcon}
                onClick={() => setView('hierarchy')}
              >
                {t('roles.view.hierarchy')}
              </ViewButton>
            </div>
            {canManage && (
              <Button onClick={() => setCreating(true)} disabled={!roles.data}>
                <PlusIcon />
                {t('roles.addRole')}
              </Button>
            )}
          </div>
        }
      />

      {error && !roles.data ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void roles.refetch()
            void permissions.refetch()
          }}
        />
      ) : loading ? (
        <LoadingState rows={8} />
      ) : !roles.data?.length || !permissions.data?.length || !selected ? (
        <Card>
          <EmptyState icon={ShieldCheckIcon} title={t('roles.empty')} />
        </Card>
      ) : view === 'hierarchy' ? (
        <HierarchyView
          roles={roles.data}
          myRoleIds={myRoles?.map((r) => r.id) ?? []}
          myLevel={myLevel}
          onSelect={select}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <RoleList
              roles={roles.data}
              selectedId={selected.id}
              onSelect={select}
              isDirty={draft.isDirty}
              myLevel={myLevel}
              canManage={canManage}
            />
            <div className="grid min-w-0 content-start gap-4 2xl:grid-cols-[minmax(0,1fr)_22rem]">
              <RoleDetailsPanel
                key={selected.id}
                role={selected}
                roles={roles.data}
                canManage={canManage}
                draft={draft}
                onDeleted={() => {
                  draft.discard(selected.id)
                  setSelectedId(null)
                }}
              />
              <RecentChanges role={selected} roles={roles.data} permissions={permissions.data} />
            </div>
          </div>

          <ScopeLegend />

          <PermissionMatrix
            roles={roles.data}
            permissions={permissions.data}
            canManage={canManage}
            draft={draft}
            selectedRoleId={selected.id}
            onSelectRole={setSelectedId}
          />
        </div>
      )}

      {canManage && roles.data && (
        <CreateRoleDialog
          open={creating}
          onOpenChange={setCreating}
          roles={roles.data}
          onCreated={(role) => select(role.id)}
        />
      )}
    </>
  )
}

function ViewButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean
  icon: typeof TableIcon
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-accent text-accent-foreground' : 'hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </button>
  )
}

function ScopeLegend() {
  const { t } = useTranslation()
  return (
    <Card className="gap-2 py-3">
      <CardContent className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {SCOPES.map((scope) => (
          <div key={scope}>
            <span className="font-medium">{t(`roles.scope.${scope}`)}</span>
            <span className="text-muted-foreground"> · {t(`roles.scopeHint.${scope}`)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
