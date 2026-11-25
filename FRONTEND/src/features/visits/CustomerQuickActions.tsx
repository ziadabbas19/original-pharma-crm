import { NavigationIcon, PhoneIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { mapsHref, telHref } from './customer-links'
import type { VisitCustomer } from './use-rep-customers'

/** Call and Directions for a customer card; each button is left out when its number or place is missing. */
export function CustomerQuickActions({
  customer,
  className,
}: {
  customer: Pick<VisitCustomer, 'name' | 'nameAr' | 'phone' | 'lat' | 'lng' | 'address' | 'townName'>
  className?: string
}) {
  const { t } = useTranslation()
  const name = localizedName(customer.name, customer.nameAr)
  const tel = telHref(customer.phone)
  const maps = mapsHref(customer)
  if (!tel && !maps) return null
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} data-testid="quick-actions">
      {tel && (
        <Button asChild size="lg" variant="outline" className={cn(!maps && 'col-span-2')}>
          <a href={tel} aria-label={t('quickActions.callName', { name })} data-testid="quick-call">
            <PhoneIcon />
            {t('quickActions.call')}
          </a>
        </Button>
      )}
      {maps && (
        <Button asChild size="lg" variant="outline" className={cn(!tel && 'col-span-2')}>
          <a
            href={maps}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('quickActions.navigateName', { name })}
            data-testid="quick-navigate"
          >
            <NavigationIcon className="rtl:-scale-x-100" />
            {t('quickActions.navigate')}
          </a>
        </Button>
      )}
    </div>
  )
}
