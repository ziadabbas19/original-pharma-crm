import { HospitalIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CustomerDto, TownDto } from '@/api/generated/model'
import { SearchInput } from '@/components/data-table/toolbar'
import { EmptyState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AddPlaceSheet } from '@/features/customers/AddPlaceSheet'
import { TownSelect } from '@/features/doctors/doctor-fields'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { useAmPlaces } from '@/features/visits/use-rep-customers'
import { localizedName } from '@/lib/format'
import { useAppSelector } from '@/store'
import { canAddPlace } from './am-places'

/**
 * Pick a place for today's AM list from every AM place the rep can see (any town of their area, not
 * only today's town), with a search box and a town filter. A new place can be added from here.
 */
export function AddAmPlaceSheet({
  open,
  onOpenChange,
  chosenIds,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chosenIds: readonly string[]
  onPick: (place: CustomerDto) => void
}) {
  const { t } = useTranslation()
  const places = useAmPlaces({ enabled: open })
  const { towns } = useDoctorReferenceData()
  const canAdd = useAppSelector((s) => canAddPlace(s.permissions.byKey))
  const [search, setSearch] = useState('')
  const [townId, setTownId] = useState('')
  const [adding, setAdding] = useState(false)

  const usedTowns = useMemo<TownDto[]>(() => {
    const ids = new Set((places.data ?? []).map((p) => p.territoryId))
    return (towns.data ?? []).filter((town) => ids.has(town.id))
  }, [places.data, towns.data])

  const q = search.trim().toLowerCase()
  const rows = (places.data ?? []).filter(
    (p) =>
      p.isActive &&
      !chosenIds.includes(p.id) &&
      (!townId || p.territoryId === townId) &&
      (!q || p.name.toLowerCase().includes(q) || (p.nameAr ?? '').includes(q)),
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-0 p-0" data-testid="add-am-sheet">
          <SheetHeader className="border-b p-4">
            <SheetTitle>{t('repHome.am.addTitle')}</SheetTitle>
            <SheetDescription>{t('repHome.am.addHint')}</SheetDescription>
            <div className="mt-2 grid gap-2 [&_input]:h-11 [&_select]:h-11">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('places.searchPlaceholder')}
                className="sm:w-full"
              />
              <TownSelect
                towns={usedTowns}
                value={townId}
                onChange={setTownId}
                allLabel={t('doctors.allTowns')}
              />
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {places.isLoading ? (
              <LoadingState rows={4} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={HospitalIcon}
                title={places.data?.length ? t('states.noMatches') : t('places.empty')}
                description={canAdd ? t('places.emptyHint') : undefined}
              />
            ) : (
              <ul className="grid gap-2" data-testid="add-am-options">
                {rows.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      className="flex min-h-14 w-full items-center gap-3 rounded-card border bg-card p-3 text-start shadow-card hover:bg-accent/60"
                      onClick={() => {
                        onPick(place)
                        onOpenChange(false)
                      }}
                    >
                      <HospitalIcon className="size-5 shrink-0 text-primary" aria-hidden />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-semibold">
                          {localizedName(place.name, place.nameAr)}
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {localizedName(place.territoryName, place.territoryNameAr)}
                        </span>
                      </span>
                      <PlusIcon className="size-5 shrink-0 text-primary" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {canAdd && (
            <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => setAdding(true)}
                data-testid="am-new-place"
              >
                <PlusIcon />
                {t('places.add')}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {canAdd && (
        <AddPlaceSheet
          open={adding}
          onOpenChange={setAdding}
          onAdded={(place) => {
            onPick(place)
            onOpenChange(false)
          }}
        />
      )}
    </>
  )
}
