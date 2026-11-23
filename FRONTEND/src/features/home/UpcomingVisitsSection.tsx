import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon, PlusIcon, StethoscopeIcon } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { formatTime, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { AddAmPlaceSheet } from './AddAmPlaceSheet'
import { placeOf } from './am-places'
import { AmVisitsSection } from './AmVisitsSection'
import { SortableList } from './SortableList'
import type { PlanItem } from './today-plan'
import { TodayAreaSheet } from './TodayAreaSheet'
import { useRepDay } from './use-rep-day'

const PILL: Record<PlanItem['kind'], 'default' | 'success' | 'secondary'> = {
  inProgress: 'default',
  waiting: 'secondary',
  done: 'success',
}

/**
 * The AM list (when there is one), then the upcoming doctor visits of today's area: the visit in
 * progress, the doctors still to see in the rep's order (drag the handle to reorder) and today's
 * finished visits. The area can be changed at any time from the chip above the list.
 */
export function UpcomingVisitsSection({ items }: { items: PlanItem[] }) {
  const { t } = useTranslation()
  const canVisit = usePermission(P.visits.create)
  const { day, setArea, setDoctorOrder, setAmPlaces } = useRepDay()
  const { towns } = useDoctorReferenceData()
  const [changing, setChanging] = useState(false)
  const [addingAm, setAddingAm] = useState(false)
  const waiting = items.filter((i) => i.kind === 'waiting')
  const chosenTown =
    day?.territoryId && day.territoryId !== day.areaId
      ? (towns.data ?? []).find((town) => town.id === day.territoryId)
      : undefined
  const areaName = chosenTown
    ? localizedName(chosenTown.name, chosenTown.nameAr)
    : t('repHome.area.wholeArea')

  return (
    <div className="grid gap-4">
      {canVisit && <AmVisitsSection />}
      <section className="grid gap-2" aria-labelledby="home-upcoming" data-testid="home-upcoming">
        <h2 id="home-upcoming" className="px-1 text-section font-bold">
          {t('repHome.sections.upcomingVisits')}
        </h2>
        {canVisit && day && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              className="min-w-0 flex-1 justify-start"
              onClick={() => setChanging(true)}
              data-testid="home-area"
            >
              <MapPinIcon className="text-primary" />
              <span className="truncate">{t('repHome.area.today', { name: areaName })}</span>
              <span className="ms-auto shrink-0 text-sm font-normal text-primary">
                {t('repHome.area.change')}
              </span>
            </Button>
            {day.amPlaces.length === 0 && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setAddingAm(true)}
                data-testid="home-am-start"
              >
                <PlusIcon />
                {t('repHome.am.short')}
              </Button>
            )}
          </div>
        )}
        {items.length === 0 ? (
          <Card className="py-2">
            <EmptyState icon={StethoscopeIcon} title={t('repHome.upcoming.empty')} className="py-6" />
          </Card>
        ) : (
          <>
            <ul className="grid gap-2">
              {items
                .filter((i) => i.kind === 'inProgress')
                .map((item) => (
                  <li key={`running-${item.customerId}`}>
                    <VisitRow item={item} />
                  </li>
                ))}
            </ul>
            {waiting.length > 0 &&
              (canVisit ? (
                <SortableList
                  items={waiting}
                  idOf={(item) => item.customerId}
                  labelOf={(item) => localizedName(item.name, item.nameAr)}
                  onReorder={(ids) => void setDoctorOrder(ids)}
                  className="grid gap-2"
                  testId="home-upcoming-list"
                  renderItem={(item, handle, index) => <VisitRow item={item} handle={handle} index={index} />}
                />
              ) : (
                <ul className="grid gap-2">
                  {waiting.map((item, index) => (
                    <li key={item.customerId}>
                      <VisitRow item={item} index={index} />
                    </li>
                  ))}
                </ul>
              ))}
            <ul className="grid gap-2">
              {items
                .filter((i) => i.kind === 'done')
                .map((item, index) => (
                  <li key={`done-${item.customerId}-${item.at ?? ''}`}>
                    <VisitRow item={item} index={index} />
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>
      {canVisit && (
        <>
          <TodayAreaSheet
            open={changing}
            onOpenChange={setChanging}
            confirmLabel={t('common.save')}
            onConfirm={async (territoryId) => {
              await setArea(territoryId)
            }}
          />
          <AddAmPlaceSheet
            open={addingAm}
            onOpenChange={setAddingAm}
            chosenIds={day?.amPlaces.map((p) => p.customerId) ?? []}
            onPick={(place) => void setAmPlaces([{ customerId: place.id }], [placeOf(place, 0)])}
          />
        </>
      )}
    </div>
  )
}

function VisitRow({ item, handle, index = 0 }: { item: PlanItem; handle?: ReactNode; index?: number }) {
  const { t, i18n } = useTranslation()
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeftIcon : ChevronRightIcon
  return (
    <div className="flex animate-fade-up items-center gap-1" style={{ '--i': index } as CSSProperties}>
      {handle}
      <Link
        to="/rep/customers/$customerId"
        params={{ customerId: item.customerId }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-card border bg-card p-3 shadow-card transition-colors hover:bg-accent/60 active:scale-[0.99]"
        data-testid="home-upcoming-item"
      >
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-control text-sm font-bold tabular-nums',
            item.kind === 'done'
              ? 'bg-success-soft text-success'
              : 'bg-primary-soft text-primary-soft-foreground',
          )}
          dir="ltr"
        >
          {item.at ? formatTime(item.at) : <StethoscopeIcon className="size-5" aria-hidden />}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-semibold">{localizedName(item.name, item.nameAr)}</span>
          <span className="truncate text-sm text-muted-foreground">
            {localizedName(item.townName, item.townNameAr) || '—'}
          </span>
        </span>
        <Badge variant={PILL[item.kind]}>{t(`repHome.status.${item.kind}`)}</Badge>
        <Chevron className="size-4 shrink-0 text-icon" aria-hidden />
      </Link>
    </div>
  )
}
