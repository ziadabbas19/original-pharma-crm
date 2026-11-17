import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, PencilIcon, PlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLookupsCreateCollectionMethod,
  useLookupsCreateSpecialty,
  useLookupsListCollectionMethods,
  useLookupsListSpecialties,
  useLookupsUpdateCollectionMethod,
  useLookupsUpdateSpecialty,
} from '@/api/generated/endpoints'
import type { LookupDto } from '@/api/generated/model'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { P } from '@/lib/permissions'

type Kind = 'specialties' | 'collectionMethods'

/** Admin-managed lists: doctor specialties and order collection methods. */
export function LookupsPage() {
  const { t } = useTranslation()
  const canManage = usePermission(P.lookups.manage)
  const specialties = useLookupsListSpecialties({ includeInactive: true })
  const methods = useLookupsListCollectionMethods({ includeInactive: true })

  return (
    <>
      <PageHeader title={t('lookups.title')} description={t('lookups.hint')} />
      <div className="grid gap-4 xl:grid-cols-2">
        <LookupCard kind="specialties" query={specialties} canManage={canManage} />
        <LookupCard kind="collectionMethods" query={methods} canManage={canManage} />
      </div>
    </>
  )
}

function LookupCard({
  kind,
  query,
  canManage,
}: {
  kind: Kind
  query: { data?: LookupDto[]; isLoading: boolean; error: unknown; refetch: () => unknown }
  canManage: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<LookupDto | null | undefined>(undefined)
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>{t(`lookups.${kind}.title`)}</CardTitle>
          <CardDescription>{t(`lookups.${kind}.hint`)}</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing(null)}>
            <PlusIcon />
            {t('lookups.add')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingState rows={4} />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data?.length ? (
          <EmptyState title={t('lookups.empty')} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {query.data.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-8 text-xs text-muted-foreground tabular-nums">
                  {formatNumber(item.sortOrder)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{localizedName(item.nameEn, item.nameAr)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {localizedName(item.nameEn, item.nameAr) === item.nameEn ? item.nameAr : item.nameEn}
                  </p>
                </div>
                {!item.isActive && <Badge variant="outline">{t('catalog.inactive')}</Badge>}
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('lookups.edit')}
                    onClick={() => setEditing(item)}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing !== undefined && (
        <LookupDialog
          key={editing?.id ?? 'new'}
          kind={kind}
          item={editing}
          nextSortOrder={Math.max(0, ...(query.data ?? []).map((i) => i.sortOrder)) + 10}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Card>
  )
}

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
      await queryClient.invalidateQueries({ queryKey: ['/api/lookups'] })
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
