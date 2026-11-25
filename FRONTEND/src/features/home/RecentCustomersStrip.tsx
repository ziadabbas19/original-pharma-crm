import { HospitalIcon, PillIcon, StethoscopeIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsRecentCustomers } from '@/api/generated/endpoints'
import type { RecentCustomerDto } from '@/api/generated/model'
import { usePermission } from '@/features/auth/usePermission'
import { CheckInSheet } from '@/features/visits/CheckInSheet'
import { fromRecent, useRepCustomers, type VisitCustomer } from '@/features/visits/use-rep-customers'
import { localizedName } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { P } from '@/lib/permissions'

const CACHE_KEY = 'recent-customers'
const LIMIT = 6

const ICONS = { doctor: StethoscopeIcon, pharmacy: PillIcon, hospital: HospitalIcon } as const

/**
 * Home: the last six customers the user visited, as chips; tapping one starts a visit through the usual
 * check-in. Kept on the device so it shows offline too.
 */
export function RecentCustomersStrip() {
  const { t } = useTranslation()
  const canVisit = usePermission(P.visits.create)
  const copy = readCache<RecentCustomerDto[]>(CACHE_KEY)
  const recent = useVisitsRecentCustomers(
    { limit: LIMIT },
    {
      query: {
        enabled: canVisit,
        initialData: copy?.data,
        initialDataUpdatedAt: copy?.savedAt,
        staleTime: 60_000,
      },
    },
  )
  const { customers } = useRepCustomers()
  const [starting, setStarting] = useState<VisitCustomer | null>(null)

  useEffect(() => {
    if (recent.data && recent.isFetchedAfterMount && !recent.isError) writeCache(CACHE_KEY, recent.data)
  }, [recent.data, recent.isFetchedAfterMount, recent.isError])

  const rows = recent.data ?? []
  if (!canVisit || rows.length === 0) return null

  return (
    <section className="grid gap-2" aria-labelledby="home-recent-title" data-testid="home-recent">
      <h2 id="home-recent-title" className="px-1 text-section font-bold">
        {t('recent.title')}
      </h2>
      {/* One scrolling row; the page itself never scrolls sideways. */}
      <ul className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1">
        {rows.map((row) => {
          const Icon = ICONS[row.type]
          const name = localizedName(row.name, row.nameAr)
          return (
            <li key={row.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setStarting(customers.find((c) => c.id === row.id) ?? fromRecent(row))}
                className="flex min-h-11 max-w-[14rem] items-center gap-2 rounded-full border bg-card ps-2 pe-4 text-sm font-medium shadow-card transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
                aria-label={t('recent.start', { name })}
                data-testid="recent-chip"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="truncate">{name}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {starting && <CheckInSheet customer={starting} onClose={() => setStarting(null)} />}
    </section>
  )
}
