import { CheckIcon, PlusIcon, SunriseIcon, TimerIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RepAmPlaceDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveVisit } from '@/features/visits/active-visit'
import { StartVisitButton } from '@/features/visits/StartVisitButton'
import { fromPharmacy, useAmPlaces, type VisitCustomer } from '@/features/visits/use-rep-customers'
import { formatNumber, localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AddAmPlaceSheet } from './AddAmPlaceSheet'
import { placeOf } from './am-places'
import { SortableList } from './SortableList'
import { amProgress, type AmStatus } from './today-plan'
import { useRepDay } from './use-rep-day'
import { useTodayVisits } from './use-today-plan'

const STATUS: Record<AmStatus, 'secondary' | 'default' | 'success'> = {
  waiting: 'secondary',
  inProgress: 'default',
  done: 'success',
}

/** The AM list as the server takes it: places in order with their planned time. */
const toInputs = (places: RepAmPlaceDto[]) =>
  places.map((p) => ({ customerId: p.customerId, plannedTime: p.plannedTime || null }))

/**
 * Today's AM places (morning visits such as a hospital), above the upcoming doctor visits. Independent of
 * today's area: the places may be in other towns. Each has an optional planned time, "Start visit" and
 * its done state; the rep adds, removes and reorders them. Counted apart from the doctor target.
 */
export function AmVisitsSection() {
  const { t } = useTranslation()
  const { day, setAmPlaces } = useRepDay()
  const visits = useTodayVisits()
  const { visit: active } = useActiveVisit()
  const places = useAmPlaces()
  const [adding, setAdding] = useState(false)
  const list = day?.amPlaces ?? []
  if (list.length === 0) return null

  const progress = amProgress({
    placeIds: list.map((p) => p.customerId),
    visits,
    activeCustomerId: active?.customer.id ?? null,
  })
  const save = (next: RepAmPlaceDto[]) => void setAmPlaces(toInputs(next), next)
  const customerOf = (place: RepAmPlaceDto): VisitCustomer => {
    const known = places.data?.find((p) => p.id === place.customerId)
    return known
      ? fromPharmacy(known)
      : {
          id: place.customerId,
          type: 'hospital',
          name: place.name,
          nameAr: place.nameAr,
          geofenceRadiusMeters: 150,
          townId: place.townId,
          townName: place.townName,
          townNameAr: place.townNameAr,
        }
  }

  return (
    <section className="grid gap-2" aria-labelledby="home-am" data-testid="home-am">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id="home-am" className="flex items-center gap-2 text-section font-bold">
          <SunriseIcon className="size-5 text-primary" aria-hidden />
          {t('repHome.am.title')}
        </h2>
        <Badge
          variant={progress.done === progress.total ? 'success' : 'secondary'}
          data-testid="home-am-progress"
        >
          {t('repHome.am.progress', {
            done: formatNumber(progress.done),
            total: formatNumber(progress.total),
          })}
        </Badge>
      </div>
      <SortableList
        items={list}
        idOf={(p) => p.customerId}
        labelOf={(p) => localizedName(p.name, p.nameAr)}
        onReorder={(ids) => save(ids.map((id) => list.find((p) => p.customerId === id)!))}
        className="grid gap-2"
        testId="home-am-list"
        renderItem={(place, handle) => {
          const status = progress.status[place.customerId] ?? 'waiting'
          return (
            <div
              className="grid gap-2 rounded-card border bg-card p-2 shadow-card"
              data-testid="home-am-item"
            >
              <div className="flex items-center gap-1">
                {handle}
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-semibold">{localizedName(place.name, place.nameAr)}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {localizedName(place.townName, place.townNameAr) || '—'}
                  </span>
                </span>
                <Badge variant={STATUS[status]}>
                  {status === 'done' ? <CheckIcon /> : status === 'inProgress' ? <TimerIcon /> : null}
                  {t(`repHome.status.${status}`)}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={t('repHome.am.remove', { name: localizedName(place.name, place.nameAr) })}
                  onClick={() => save(list.filter((p) => p.customerId !== place.customerId))}
                  data-testid="home-am-remove"
                >
                  <XIcon />
                </Button>
              </div>
              <div className="flex items-center gap-2 ps-12">
                <PlannedTime
                  value={place.plannedTime ?? ''}
                  label={t('repHome.am.plannedTime')}
                  onSave={(time) =>
                    save(
                      list.map((p) =>
                        p.customerId === place.customerId ? { ...p, plannedTime: time || null } : p,
                      ),
                    )
                  }
                />
                {status !== 'done' && <StartVisitButton customer={customerOf(place)} className="flex-1" />}
              </div>
            </div>
          )
        }}
      />
      <Button variant="outline" size="lg" onClick={() => setAdding(true)} data-testid="home-am-add">
        <PlusIcon />
        {t('repHome.am.add')}
      </Button>
      <AddAmPlaceSheet
        open={adding}
        onOpenChange={setAdding}
        chosenIds={list.map((p) => p.customerId)}
        onPick={(picked) => save([...list, placeOf(picked, list.length)])}
      />
    </section>
  )
}

/** The optional planned time of a place; saved when the field loses focus. */
function PlannedTime({
  value,
  label,
  onSave,
}: {
  value: string
  label: string
  onSave: (time: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  return (
    <Input
      type="time"
      dir="ltr"
      aria-label={label}
      title={label}
      className={cn('h-11 w-32 shrink-0', !shown && 'text-muted-foreground')}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onSave(draft)
        setDraft(null)
      }}
      data-testid="home-am-time"
    />
  )
}
