import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, MapPinCheckIcon, MapPinPlusIcon, PhoneIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { localizedName } from '@/lib/format'
import { StartVisitButton } from './StartVisitButton'
import { useRepCustomers } from './use-rep-customers'

const route = getRouteApi('/rep/customers/$customerId')

/** A doctor or pharmacy: contact details, whether a location is saved, and "Start visit". */
export function RepCustomerPage() {
  const { t, i18n } = useTranslation()
  const { customerId } = route.useParams()
  const { customers, isLoading } = useRepCustomers()
  const customer = customers.find((c) => c.id === customerId)
  const Back = i18n.dir() === 'rtl' ? ArrowRightIcon : ArrowLeftIcon

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="lg" className="-ms-2">
        <Link to="/rep/doctors">
          <Back />
          {t('nav.myDoctors')}
        </Link>
      </Button>

      {!customer ? (
        isLoading ? (
          <LoadingState rows={4} />
        ) : (
          <EmptyState title={t('errors.not-found')} />
        )
      ) : (
        <>
          <Card className="py-4">
            <CardContent className="grid gap-2 px-4">
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-lg font-semibold">{localizedName(customer.name, customer.nameAr)}</h1>
                <Badge variant="secondary">{t(`customers.types.${customer.type}`)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {[
                  localizedName(customer.specialtyNameEn, customer.specialtyNameAr),
                  localizedName(customer.townName, customer.townNameAr),
                  customer.address,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {customer.lat != null ? (
                <p className="flex items-center gap-1.5 text-sm" data-testid="customer-has-location">
                  <MapPinCheckIcon className="size-4 text-success" aria-hidden />
                  {t('visits.customerPage.hasLocation')}
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-sm" data-testid="customer-no-location">
                  <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {t('visits.customerPage.firstVisitSaves')}
                </p>
              )}
              {customer.notes && (
                <p className="text-sm whitespace-pre-line text-muted-foreground">{customer.notes}</p>
              )}
              {customer.phone && (
                <Button asChild size="lg" variant="outline" className="w-fit">
                  <a href={`tel:${customer.phone.replace(/\s+/g, '')}`} dir="ltr">
                    <PhoneIcon />
                    {customer.phone}
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
          <StartVisitButton customer={customer} className="w-full" />
        </>
      )}
    </div>
  )
}
