import { useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PhoneIcon, PlusIcon, StethoscopeIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDoctorsList, useDoctorsRemoveFromMyList } from '@/api/generated/endpoints'
import type { DoctorDto } from '@/api/generated/model'
import { SearchInput } from '@/components/data-table/toolbar'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { formatNumber, localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { P } from '@/lib/permissions'
import { AddDoctorSheet } from './AddDoctorSheet'
import { OutsideAreaBadge, SpecialtySelect, TownSelect } from './doctor-fields'
import { DoctorEditDialog } from './DoctorEditDialog'

/** The rep's own doctor list, with search and town / specialty filters. */
export function RepDoctorsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canAdd = usePermission(P.customers.create)
  const copy = readCache<DoctorDto[]>('my-doctors')
  const doctors = useDoctorsList(
    { Mine: true },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 60_000 } },
  )
  const { towns, specialties } = useDoctorReferenceData()
  const remove = useDoctorsRemoveFromMyList()
  const [search, setSearch] = useState('')
  const [townId, setTownId] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<DoctorDto | null>(null)

  useEffect(() => {
    if (doctors.data && doctors.isFetchedAfterMount) writeCache('my-doctors', doctors.data)
  }, [doctors.data, doctors.isFetchedAfterMount])

  // Only towns that appear in the list, so the filter stays short.
  const usedTowns = useMemo(() => {
    const ids = new Set((doctors.data ?? []).map((d) => d.townId))
    return (towns.data ?? []).filter((town) => ids.has(town.id))
  }, [doctors.data, towns.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (doctors.data ?? []).filter(
      (d) =>
        (!townId || d.townId === townId) &&
        (!specialtyId || d.specialtyId === specialtyId) &&
        (!q ||
          d.name.toLowerCase().includes(q) ||
          (d.nameAr ?? '').includes(q) ||
          (d.phone ?? '').includes(q)),
    )
  }, [doctors.data, search, townId, specialtyId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('doctors.mine')}{' '}
          {doctors.data && (
            <span className="text-base font-normal text-muted-foreground">
              ({formatNumber(doctors.data.length)})
            </span>
          )}
        </h1>
        {canAdd && (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            {t('doctors.add')}
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('doctors.searchPlaceholder')}
          className="sm:w-full"
        />
        <div className="grid grid-cols-2 gap-2">
          <TownSelect
            towns={usedTowns}
            value={townId}
            onChange={setTownId}
            allLabel={t('doctors.allTowns')}
          />
          <SpecialtySelect
            specialties={specialties.data ?? []}
            value={specialtyId}
            onChange={setSpecialtyId}
            allLabel={t('doctors.allSpecialties')}
          />
        </div>
      </div>

      {doctors.isLoading ? (
        <LoadingState rows={5} />
      ) : doctors.error && !doctors.data ? (
        <ErrorState error={doctors.error} onRetry={() => void doctors.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={StethoscopeIcon}
          title={doctors.data?.length ? t('states.noMatches') : t('doctors.emptyMine')}
          description={doctors.data?.length ? t('states.noMatchesHint') : t('doctors.emptyMineHint')}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((d) => (
            <li key={d.id}>
              <Card className="py-3">
                <CardContent className="grid gap-2 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{localizedName(d.name, d.nameAr)}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          localizedName(d.specialtyNameEn, d.specialtyNameAr),
                          localizedName(d.townName, d.townNameAr),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {d.outsideMyArea && <OutsideAreaBadge />}
                  </div>
                  {d.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{d.notes}</p>}
                  <div className="flex flex-wrap gap-1">
                    {d.phone && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`tel:${d.phone.replace(/\s+/g, '')}`} dir="ltr">
                          <PhoneIcon />
                          {d.phone}
                        </a>
                      </Button>
                    )}
                    {canAdd && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                          <PencilIcon />
                          {t('doctors.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                t('doctors.removeConfirm', { name: localizedName(d.name, d.nameAr) }),
                              )
                            )
                              return
                            await remove.mutateAsync({ id: d.id })
                            await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
                          }}
                        >
                          <Trash2Icon />
                          {t('doctors.removeFromList')}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <AddDoctorSheet open={adding} onOpenChange={setAdding} onAdded={() => void doctors.refetch()} />
      )}
      {editing && <DoctorEditDialog key={editing.id} doctor={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
