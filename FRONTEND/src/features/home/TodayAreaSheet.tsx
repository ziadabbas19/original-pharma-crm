import { CalendarCheckIcon, Loader2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { localizedName } from '@/lib/format'
import { useRepDay } from './use-rep-day'

/**
 * Where the rep works today: one town of their area, or the whole area. Prefilled from today's entry
 * in the weekly plan; used by "Start my day" and by the change button on the upcoming visits.
 */
export function TodayAreaSheet({
  open,
  onOpenChange,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  confirmLabel: string
  onConfirm: (territoryId: string | null) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const { day } = useRepDay()
  const { towns } = useDoctorReferenceData()
  const [choice, setChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const value = choice ?? (day?.territoryId && day.territoryId !== day.areaId ? day.territoryId : '')
  const areaId = day?.areaId ?? null
  const options = useMemo(
    () => (towns.data ?? []).filter((town) => !areaId || town.areaId === areaId),
    [towns.data, areaId],
  )
  const fromPlan = !!day && !day.areaChosen && !!day.planCityId && value === day.planCityId

  const close = (next: boolean) => {
    if (!next) setChoice(null)
    onOpenChange(next)
  }

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm(value || null)
      close(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="gap-0 p-0" data-testid="today-area-sheet">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('repHome.area.title')}</SheetTitle>
          <SheetDescription>{t('repHome.area.hint')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid gap-2">
            <Label htmlFor="today-area">{t('repHome.area.label')}</Label>
            <NativeSelect
              id="today-area"
              className="h-11"
              value={value}
              onChange={(e) => setChoice(e.target.value)}
              data-testid="today-area-select"
            >
              <option value="">{t('repHome.area.wholeArea')}</option>
              {options.map((town) => (
                <option key={town.id} value={town.id}>
                  {localizedName(town.name, town.nameAr)}
                </option>
              ))}
            </NativeSelect>
            {fromPlan && (
              <p
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                data-testid="today-area-from-plan"
              >
                <CalendarCheckIcon className="size-4 text-primary" aria-hidden />
                {t('repHome.area.fromPlan')}
              </p>
            )}
          </div>
          <Button size="lg" disabled={busy} onClick={() => void confirm()} data-testid="today-area-confirm">
            {busy && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
