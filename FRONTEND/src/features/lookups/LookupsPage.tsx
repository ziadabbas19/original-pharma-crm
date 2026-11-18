import { useQueryClient } from '@tanstack/react-query'
import { ListChecksIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  lookupsDeleteCollectionMethods,
  lookupsDeleteSpecialties,
  lookupsRestoreCollectionMethods,
  lookupsRestoreSpecialties,
  useLookupsCreateCollectionMethod,
  useLookupsCreateSpecialty,
  useLookupsListCollectionMethods,
  useLookupsListSpecialties,
  useLookupsUpdateCollectionMethod,
  useLookupsUpdateSpecialty,
} from '@/api/generated/endpoints'
import type { BulkDeleteRequest, BulkResult, LookupDto } from '@/api/generated/model'
import { ArchivedBadge, ArchivedToggle, RestoreSelectedButton } from '@/components/bulk/ArchiveControls'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { FormError } from '@/components/states'
import { Badge } from '@/components/ui/badge'
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
import { usePermission } from '@/features/auth/usePermission'
import { formatNumber, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { P } from '@/lib/permissions'

type Kind = 'specialties' | 'collectionMethods'

const column = dataTableColumns<LookupDto>()

/** Admin-managed lists: doctor specialties and order collection methods. */
export function LookupsPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('lookups.title')} description={t('lookups.hint')} />
      <div className="grid gap-4 2xl:grid-cols-2">
        <SpecialtiesTable />
        <CollectionMethodsTable />
      </div>
    </>
  )
}

function SpecialtiesTable() {
  const [archived, setArchived] = useState(false)
  const query = useLookupsListSpecialties({ includeInactive: true, archived })
  return (
    <LookupTable
      kind="specialties"
      archived={archived}
      onArchivedChange={setArchived}
      query={query}
      remove={lookupsDeleteSpecialties}
      restore={(ids) => lookupsRestoreSpecialties({ ids })}
    />
  )
}

function CollectionMethodsTable() {
  const [archived, setArchived] = useState(false)
  const query = useLookupsListCollectionMethods({ includeInactive: true, archived })
  return (
    <LookupTable
      kind="collectionMethods"
      archived={archived}
      onArchivedChange={setArchived}
      query={query}
      remove={lookupsDeleteCollectionMethods}
      restore={(ids) => lookupsRestoreCollectionMethods({ ids })}
    />
  )
}

function LookupTable({
  kind,
  archived,
  onArchivedChange,
  query,
  remove,
  restore,
}: {
  kind: Kind
  archived: boolean
  onArchivedChange: (archived: boolean) => void
  query: { data?: LookupDto[]; isLoading: boolean; error: unknown; refetch: () => unknown }
  remove: (request: BulkDeleteRequest) => Promise<BulkResult>
  restore: (ids: string[]) => Promise<BulkResult>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canManage = usePermission(P.lookups.manage)
  const canDelete = usePermission(P.lookups.delete)
  const canRestore = usePermission(P.lookups.restore)
  const [editing, setEditing] = useState<LookupDto | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const target = useDeleteTarget()

  const rows = useMemo(() => {
    if (!query.data) return undefined
    const q = search.trim().toLowerCase()
    return q
      ? query.data.filter((i) => i.nameEn.toLowerCase().includes(q) || i.nameAr.includes(q))
      : query.data
  }, [query.data, search])
  const selection = useSelection(rows, getId)
  const byId = useMemo(() => new Map((query.data ?? []).map((i) => [i.id, i])), [query.data])
  const nameOf = (id: string) => {
    const item = byId.get(id)
    return item ? localizedName(item.nameEn, item.nameAr) : id
  }
  const bulk = useBulkRunner(remove, ['/api/lookups'], selection)
  const selectable = archived ? canRestore : canDelete

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((i) => localizedName(i.nameEn, i.nameAr), {
          id: 'name',
          header: () => t('lookups.name'),
          cell: ({ row }) => {
            const item = row.original
            const shown = localizedName(item.nameEn, item.nameAr)
            return (
              <div className="min-w-0">
                <div className="font-medium">{shown}</div>
                <div className="text-xs text-muted-foreground">
                  {shown === item.nameEn ? item.nameAr : item.nameEn}
                </div>
              </div>
            )
          },
        }),
        column.accessor('sortOrder', {
          header: () => t('lookups.sortOrder'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          meta: { className: 'hidden @[39rem]:table-cell' },
        }),
        column.accessor((i) => i.usageCount ?? 0, {
          id: 'usage',
          header: () => t(`lookups.${kind}.usage`),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          meta: { className: 'hidden @[34rem]:table-cell' },
        }),
        column.accessor('isActive', {
          header: () => t('users.status'),
          cell: ({ row }) =>
            row.original.archivedAt ? (
              <ArchivedBadge />
            ) : row.original.isActive ? (
              <Badge variant="success">{t('catalog.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('catalog.inactive')}</Badge>
            ),
          meta: { className: 'hidden @[28rem]:table-cell' },
        }),
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('table.actions')}</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {canManage && !row.original.archivedAt && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={t('lookups.edit')}
                  title={t('lookups.edit')}
                  onClick={() => setEditing(row.original)}
                >
                  <PencilIcon />
                </Button>
              )}
              {canDelete && !row.original.archivedAt && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                  onClick={() => target.open([row.original.id])}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ),
        }),
      ]),
    [t, kind, canManage, canDelete, target],
  )

  return (
    <div className="grid content-start gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="font-semibold">{t(`lookups.${kind}.title`)}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t(`lookups.${kind}.hint`)}</p>
        </div>
        {canManage && !archived && (
          <Button size="sm" onClick={() => setEditing(null)}>
            <PlusIcon />
            {t(`lookups.${kind}.add`)}
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={getId}
        pageSize={10}
        filtered={search !== ''}
        onClearFilters={() => setSearch('')}
        empty={{ icon: ListChecksIcon, title: archived ? t('archive.empty') : t('lookups.empty') }}
        selection={selectable ? selection : undefined}
        rowLabel={(i) => localizedName(i.nameEn, i.nameAr)}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={restore}
              onDone={() => void invalidateApi(queryClient, '/api/lookups')}
            />
          ) : (
            <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
              <Trash2Icon />
              {t('bulk.deleteSelected')}
            </Button>
          )
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} />
            <ToolbarSpacer />
            {(canDelete || canRestore) && (
              <ArchivedToggle
                archived={archived}
                onChange={(v) => {
                  selection.clear()
                  onArchivedChange(v)
                }}
              />
            )}
          </>
        }
      />
      {editing !== undefined && (
        <LookupDialog
          key={editing?.id ?? 'new'}
          kind={kind}
          item={editing}
          nextSortOrder={Math.max(0, ...(query.data ?? []).map((i) => i.sortOrder)) + 10}
          onClose={() => setEditing(undefined)}
        />
      )}
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          consequence={t(`lookups.${kind}.deleteConsequence`)}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
    </div>
  )
}

const getId = (item: LookupDto) => item.id

function LookupDialog({
  kind,
  item,
  nextSortOrder,
  onClose,
}: {
  kind: Kind
  item: LookupDto | null
  nextSortOrder: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const createSpecialty = useLookupsCreateSpecialty()
  const updateSpecialty = useLookupsUpdateSpecialty()
  const createMethod = useLookupsCreateCollectionMethod()
  const updateMethod = useLookupsUpdateCollectionMethod()
  const [nameAr, setNameAr] = useState(item?.nameAr ?? '')
  const [nameEn, setNameEn] = useState(item?.nameEn ?? '')
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? nextSortOrder))
  const [active, setActive] = useState(item?.isActive ?? true)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const busy =
    createSpecialty.isPending || updateSpecialty.isPending || createMethod.isPending || updateMethod.isPending

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!nameAr.trim() || !nameEn.trim()) return
    const data = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      isActive: active,
      sortOrder: Number(sortOrder) || 0,
    }
    try {
      if (kind === 'specialties') {
        if (item) await updateSpecialty.mutateAsync({ id: item.id, data })
        else await createSpecialty.mutateAsync({ data })
      } else if (item) await updateMethod.mutateAsync({ id: item.id, data })
      else await createMethod.mutateAsync({ data })
      await invalidateApi(queryClient, '/api/lookups')
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? t('lookups.edit') : t(`lookups.${kind}.add`)}</DialogTitle>
          <DialogDescription>{t(`lookups.${kind}.hint`)}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <div className="grid gap-2">
            <Label htmlFor="lookup-ar">{t('catalog.nameAr')}</Label>
            <Input
              id="lookup-ar"
              dir="rtl"
              maxLength={100}
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              aria-invalid={touched && !nameAr.trim()}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lookup-en">{t('catalog.nameEn')}</Label>
            <Input
              id="lookup-en"
              dir="ltr"
              maxLength={100}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              aria-invalid={touched && !nameEn.trim()}
            />
          </div>
          {touched && (!nameAr.trim() || !nameEn.trim()) && (
            <p className="text-sm text-destructive">{t('catalog.namesRequired')}</p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="lookup-order">{t('lookups.sortOrder')}</Label>
            <Input
              id="lookup-order"
              dir="ltr"
              inputMode="numeric"
              className="w-28"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t('catalog.active')}
          </Label>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
