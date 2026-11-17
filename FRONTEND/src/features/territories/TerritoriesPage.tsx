import { useQueryClient } from '@tanstack/react-query'
import { CornerDownLeftIcon, MapPinnedIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTerritoriesDelete, useTerritoriesList } from '@/api/generated/endpoints'
import type { TerritoryDto, TerritoryLevel } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { FormError } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission, usePermissionScope } from '@/features/auth/usePermission'
import { formatNumber, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { TerritoryDialog } from './TerritoryDialog'
import { flattenTerritories, type TerritoryNode } from './territory-tree'

const column = dataTableColumns<TerritoryNode>()
const LEVELS: TerritoryLevel[] = ['region', 'area', 'town']
const LEVEL_BADGE: Record<TerritoryLevel, 'default' | 'secondary' | 'outline'> = {
  region: 'default',
  area: 'secondary',
  town: 'outline',
}
const CHILD_LEVEL: Partial<Record<TerritoryLevel, TerritoryLevel>> = { region: 'area', area: 'town' }

interface Editing {
  territory: TerritoryDto | null
  level: TerritoryLevel
  parentId?: string
}

export function TerritoriesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const territories = useTerritoriesList()
  const canManage = usePermission(P.territories.manage)
  const manageAll = usePermissionScope(P.territories.manage) === 'all'
  const remove = useTerritoriesDelete()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<'' | TerritoryLevel>('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleteError, setDeleteError] = useState<unknown>(null)

  const deleteNode = async (node: TerritoryDto) => {
    setDeleteError(null)
    if (!window.confirm(t('territories.deleteConfirm', { name: localizedName(node.name, node.nameAr) })))
      return
    try {
      await remove.mutateAsync({ id: node.id })
      await queryClient.invalidateQueries({ queryKey: ['/api/territories'] })
      await queryClient.invalidateQueries({ queryKey: ['/api/lookups/towns'] })
    } catch (e) {
      setDeleteError(e)
    }
  }

  const nodes = useMemo(
    () => (territories.data ? flattenTerritories(territories.data) : undefined),
    [territories.data],
  )
  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])

  const filtered = useMemo(() => {
    if (!nodes) return undefined
    const q = search.trim().toLowerCase()
    return nodes.filter(
      (n) =>
        (!level || n.level === level) &&
        (!q ||
          n.name.toLowerCase().includes(q) ||
          (n.nameAr ?? '').includes(q) ||
          n.code.toLowerCase().includes(q)),
    )
  }, [nodes, search, level])

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((n) => localizedName(n.name, n.nameAr), {
          id: 'name',
          header: () => t('territories.name'),
          enableSorting: false,
          cell: ({ row }) => {
            const n = row.original
            const other = localizedName(n.name, n.nameAr) === n.name ? n.nameAr : n.name
            return (
              <div className="flex items-center gap-2" style={{ paddingInlineStart: `${n.depth * 1.25}rem` }}>
                {n.depth > 0 && (
                  <CornerDownLeftIcon
                    className="size-3.5 shrink-0 text-muted-foreground ltr:-scale-x-100"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{localizedName(n.name, n.nameAr)}</div>
                  {other && <div className="text-xs text-muted-foreground">{other}</div>}
                </div>
              </div>
            )
          },
        }),
        column.accessor('code', {
          header: () => t('territories.code'),
          cell: (info) => (
            <span dir="ltr" className="font-mono text-xs">
              {info.getValue()}
            </span>
          ),
        }),
        column.accessor('level', {
          header: () => t('territories.level'),
          cell: (info) => (
            <Badge variant={LEVEL_BADGE[info.getValue()]}>{t(`territories.levels.${info.getValue()}`)}</Badge>
          ),
        }),
        column.accessor(
          (n) => (n.parentId ? localizedName(byId.get(n.parentId)?.name, byId.get(n.parentId)?.nameAr) : ''),
          {
            id: 'parent',
            header: () => t('territories.parent'),
            cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
            meta: { className: 'hidden md:table-cell' },
          },
        ),
        column.accessor('userCount', {
          header: () => t('territories.users'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
        }),
        column.accessor('customerCount', {
          header: () => t('territories.customers'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
        }),
        ...(canManage
          ? [
              column.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => {
                  const node = row.original
                  const child = CHILD_LEVEL[node.level]
                  const empty = node.childCount + node.userCount + node.customerCount === 0
                  return (
                    <div className="flex justify-end gap-1">
                      {child && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t(`territories.add.${child}`)}
                          aria-label={t(`territories.add.${child}`)}
                          onClick={() => setEditing({ territory: null, level: child, parentId: node.id })}
                        >
                          <PlusIcon />
                          <span className="hidden 2xl:inline">{t(`territories.add.${child}`)}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('territories.edit')}
                        onClick={() => setEditing({ territory: node, level: node.level })}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!empty || remove.isPending}
                        title={empty ? t('territories.delete') : t('territories.notEmpty')}
                        aria-label={t('territories.delete')}
                        onClick={() => void deleteNode(node)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, byId, canManage, remove.isPending],
  )

  return (
    <>
      <PageHeader
        title={t('territories.title')}
        description={t('territories.hint')}
        actions={
          canManage && (
            <div className="flex flex-wrap gap-2">
              {manageAll && (
                <Button variant="outline" onClick={() => setEditing({ territory: null, level: 'region' })}>
                  <PlusIcon />
                  {t('territories.add.region')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditing({ territory: null, level: 'area' })}>
                <PlusIcon />
                {t('territories.add.area')}
              </Button>
              <Button onClick={() => setEditing({ territory: null, level: 'town' })}>
                <PlusIcon />
                {t('territories.add.town')}
              </Button>
            </div>
          )
        }
      />
      <FormError error={deleteError} />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={territories.isLoading}
        error={territories.error}
        onRetry={() => void territories.refetch()}
        getRowId={(n) => n.id}
        pageSize={50}
        filtered={search !== '' || level !== ''}
        onClearFilters={() => {
          setSearch('')
          setLevel('')
        }}
        empty={{ icon: MapPinnedIcon, title: t('territories.empty') }}
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('territories.searchPlaceholder')}
            />
            <FilterField label={t('territories.level')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as '' | TerritoryLevel)}
                >
                  <option value="">{t('table.all')}</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {t(`territories.levels.${l}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
          </>
        }
      />
      {editing && territories.data && (
        <TerritoryDialog
          key={editing.territory?.id ?? `${editing.level}-${editing.parentId ?? ''}`}
          territory={editing.territory}
          level={editing.level}
          parentId={editing.parentId}
          territories={territories.data}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
