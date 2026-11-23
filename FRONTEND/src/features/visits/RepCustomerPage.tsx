import { getRouteApi, Link } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  LandmarkIcon,
  MapPinCheckIcon,
  MapPinIcon,
  MapPinPlusIcon,
  PhoneIcon,
  UserRoundPlusIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DoctorSchedule } from '@/features/doctors/DoctorSchedule'
import { localizedName } from '@/lib/format'
import { StartVisitButton } from './StartVisitButton'
import { useRepCustomers } from './use-rep-customers'

const route = getRouteApi('/rep/customers/$customerId')

/**
 * A doctor, pharmacy or AM place: address and landmark, contact details, whether a location is saved,
 * the doctor's visiting hours and who added the doctor, and "Start visit".
 */
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
          <EmptyState title={t('errors.kind.notFound')} />
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
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {customer.address && (
                <p className="flex items-start gap-1.5 text-sm" data-testid="customer-address">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {customer.address}
                </p>
              )}
              {customer.landmark && (
                <p className="flex items-start gap-1.5 text-sm" data-testid="customer-landmark">
                  <LandmarkIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {t('doctors.landmarkLine', { landmark: customer.landmark })}
                </p>
              )}
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
              {customer.type === 'doctor' && (
                <>
                  <DoctorSchedule slots={customer.availability} className="border-t pt-3" />
                  <p
                    className="flex items-center gap-1.5 text-sm text-muted-foreground"
                    data-testid="customer-added-by"
                  >
                    <UserRoundPlusIcon className="size-4 shrink-0" aria-hidden />
                    {t('doctors.addedBy', { name: customer.createdByName ?? t('doctors.notRecorded') })}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <StartVisitButton customer={customer} className="w-full" />
        </>
      )}
    </div>
  )
}
