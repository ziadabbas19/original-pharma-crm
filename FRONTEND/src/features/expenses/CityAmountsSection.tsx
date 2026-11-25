import { InfoIcon, MapPinIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTerritoriesExpenseDefaults } from '@/api/generated/endpoints'
import type { TownDto } from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CityExpenseDialog } from '@/features/territories/CityExpenseDialog'
import { formatMoney, localizedName } from '@/lib/format'
import { useAppSelector } from '@/store'
import { groupTownsByArea, showsCityAmounts } from './city-amounts'

/**
 * "My daily amounts" on the rep's expenses screen, for people whose role was given expenses:settings:
 * the towns they may set (the server limits them to the role's scope) with the amount that applies to
 * them. Each change is the caller's own amount for that town; other reps keep theirs, and towns without
 * an own amount show the town's default.
 */
export function CityAmountsSection() {
  const granted = useAppSelector((s) => s.permissions.byKey)
  return showsCityAmounts(granted) ? <CityAmounts /> : null
}

function CityAmounts() {
  const { t } = useTranslation()
  const towns = useTerritoriesExpenseDefaults({ query: { refetchOnMount: 'always' } })
  const [editing, setEditing] = useState<TownDto | null>(null)
  const groups = groupTownsByArea(towns.data ?? [])

  return (
    <Card className="gap-3 py-4" data-testid="city-amounts">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{t('expenses.cityAmounts.title')}</CardTitle>
        <CardDescription>{t('expenses.cityAmounts.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {towns.isLoading ? (
          <LoadingState rows={3} />
        ) : towns.error && !towns.data ? (
          <ErrorState error={towns.error} onRetry={() => void towns.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState icon={MapPinIcon} title={t('expenses.cityAmounts.empty')} className="py-4" />
        ) : (
          groups.map((group) => (
            <div key={group.areaId} className="grid gap-1">
              {groups.length > 1 && (
                <p className="text-label font-semibold text-muted-foreground">
                  {localizedName(group.towns[0].areaName, group.towns[0].areaNameAr)}
                </p>
              )}
              <ul className="divide-y rounded-control border" data-testid="city-amounts-list">
                {group.towns.map((town) => {
                  const city = localizedName(town.name, town.nameAr)
                  const amount = town.defaultDailyExpense ?? 0
                  return (
                    <li
                      key={town.id}
                      className="flex min-h-12 items-center gap-2 ps-3 pe-1"
                      data-testid="city-amount"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium" data-testid="city-amount-name">
                          {city}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid="city-amount-kind">
                          {town.isOwn ? t('expenses.cityAmounts.own') : t('expenses.cityAmounts.default')}
                        </span>
                      </span>
                      <span
                        className={
                          amount > 0 ? 'font-semibold tabular-nums' : 'text-sm text-muted-foreground'
                        }
                        data-testid="city-amount-value"
                      >
                        {amount > 0 ? formatMoney(amount) : t('expenses.cityAmounts.none')}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        onClick={() => setEditing(town)}
                        aria-label={t('expenses.cityAmounts.edit', { city })}
                        data-testid="city-amount-edit"
                      >
                        <PencilIcon />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground" data-testid="city-amounts-note">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('expenses.cityAmounts.note')}
        </p>
      </CardContent>
      {editing && <CityExpenseDialog mine town={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}
