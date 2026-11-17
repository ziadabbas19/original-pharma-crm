import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTerritoriesCreate, useTerritoriesUpdate } from '@/api/generated/endpoints'
import type { TerritoryDto, TerritoryLevel } from '@/api/generated/model'
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
import { localizedName } from '@/lib/format'

const PARENT_LEVEL: Record<TerritoryLevel, TerritoryLevel | null> = {
  region: null,
  area: 'region',
  town: 'area',
}

/** Create a region / area / town, or rename and move one. */
export function TerritoryDialog({
  territory,
  level: newLevel,
  parentId: newParentId,
  territories,
  onClose,
}: {
  /** null when creating. */
  territory: TerritoryDto | null
  level: TerritoryLevel
  parentId?: string
  territories: TerritoryDto[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const create = useTerritoriesCreate()
  const update = useTerritoriesUpdate()
  const level = territory?.level ?? newLevel
  const parentLevel = PARENT_LEVEL[level]
  const parents = territories.filter((x) => x.level === parentLevel)
  const [name, setName] = useState(territory?.name ?? '')
  const [nameAr, setNameAr] = useState(territory?.nameAr ?? '')
  const [code, setCode] = useState(territory?.code ?? '')
  const [parentId, setParentId] = useState(
    territory?.parentId ?? newParentId ?? (parents.length === 1 ? parents[0].id : ''),
  )
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const busy = create.isPending || update.isPending
  const problems = { name: !name.trim(), parent: parentLevel !== null && !parentId }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (problems.name || problems.parent) return
    const common = {
      name: name.trim(),
      nameAr: nameAr.trim() || null,
      parentId: parentId || null,
      code: code.trim() || null,
    }
    try {
      if (territory) await update.mutateAsync({ id: territory.id, data: common })
      else await create.mutateAsync({ data: { ...common, level } })
      await queryClient.invalidateQueries({ queryKey: ['/api/territories'] })
      await queryClient.invalidateQueries({ queryKey: ['/api/lookups/towns'] })
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{territory ? t('territories.edit') : t(`territories.add.${level}`)}</DialogTitle>
          <DialogDescription>{t(`territories.levelHints.${level}`)}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          {parentLevel && (
            <div className="grid gap-2">
              <Label htmlFor="territory-parent">{t(`territories.levels.${parentLevel}`)}</Label>
              <NativeSelect
                id="territory-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                aria-invalid={touched && problems.parent}
              >
                <option value="">{t('orders.form.choose')}</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {localizedName(p.name, p.nameAr)}
                  </option>
                ))}
              </NativeSelect>
              {touched && problems.parent && (
                <p className="text-sm text-destructive">{t('forms.required')}</p>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="territory-name-ar">{t('catalog.nameAr')}</Label>
            <Input
              id="territory-name-ar"
              dir="rtl"
              maxLength={200}
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="territory-name">{t('catalog.nameEn')}</Label>
            <Input
              id="territory-name"
              dir="ltr"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={touched && problems.name}
            />
            {touched && problems.name && <p className="text-sm text-destructive">{t('forms.required')}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="territory-code">{t('territories.code')}</Label>
            <Input
              id="territory-code"
              dir="ltr"
              maxLength={32}
              className="font-mono uppercase"
              value={code}
              placeholder={t('territories.codeAuto')}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
            />
          </div>
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
