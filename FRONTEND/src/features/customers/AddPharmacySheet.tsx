import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2Icon, MapPinPlusIcon, WifiOffIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getCustomersListQueryKey,
  useCustomersCreatePharmacy,
  useCustomersPharmacyTowns,
} from '@/api/generated/endpoints'
import type { CustomerDto, TownDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { TownSelect } from '@/features/doctors/doctor-fields'
import { useOnline } from '@/hooks/use-online'
import { handleError, inlineErrors } from '@/lib/errors'
import { readCache, writeCache } from '@/lib/offline-cache'
import {
  EMPTY_PHARMACY,
  PHARMACY_LIMITS,
  pharmacyProblems,
  toCreatePharmacyRequest,
  withPharmacy,
  type PharmacyFormValues,
} from './pharmacy-form'

const TOWNS_KEY = 'pharmacy-towns'
const PHARMACIES_KEY = 'my-pharmacies'

/**
 * Add a pharmacy from the rep app (customers:create-pharmacy), like adding a doctor: name, town (only
 * the towns of the rep's own area), address, phone and notes. No location now: the first visit saves
 * it. A pharmacy already known in that town is offered instead of a duplicate.
 */
export function AddPharmacySheet({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (pharmacy: CustomerDto) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const copy = readCache<TownDto[]>(TOWNS_KEY)
  const towns = useCustomersPharmacyTowns({
    query: {
      enabled: open,
      initialData: copy?.data,
      initialDataUpdatedAt: copy?.savedAt,
      staleTime: 5 * 60_000,
    },
  })
  const create = useCustomersCreatePharmacy(inlineErrors)
  const [values, setValues] = useState<PharmacyFormValues>(EMPTY_PHARMACY)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  // A single town (the usual case for a rep's area) counts as chosen.
  const onlyTown = towns.data?.length === 1 ? towns.data[0].id : ''
  const form = { ...values, townId: values.townId || onlyTown }
  const problems = pharmacyProblems(form)
  const set = (patch: Partial<PharmacyFormValues>) => setValues((v) => ({ ...v, ...patch }))

  useEffect(() => {
    if (towns.data && towns.isFetchedAfterMount) writeCache(TOWNS_KEY, towns.data)
  }, [towns.data, towns.isFetchedAfterMount])

  const close = () => {
    setValues(EMPTY_PHARMACY)
    setTouched(false)
    setError(null)
    setExistingId(null)
    onOpenChange(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    setExistingId(null)
    if (problems.name || problems.townId) return
    try {
      const pharmacy = await create.mutateAsync({ data: toCreatePharmacyRequest(form) })
      // On the list at once, and on the phone's copy for offline use.
      const key = getCustomersListQueryKey({ type: 'pharmacy' })
      const next = withPharmacy(queryClient.getQueryData<CustomerDto[]>(key), pharmacy)
      queryClient.setQueryData(key, next)
      writeCache(PHARMACIES_KEY, next)
      void queryClient.invalidateQueries({ queryKey: ['/api/customers'] })
      onAdded?.(pharmacy)
      close()
    } catch (err) {
      const failure = handleError(err, { silent: true, context: 'pharmacies.add' })
      // Already known in that town: open the existing pharmacy instead.
      if (failure.code === 'pharmacy_exists' && typeof failure.details.pharmacyId === 'string') {
        setExistingId(failure.details.pharmacyId)
      } else {
        setError(failure)
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <SheetContent
        side="bottom"
        className="flex h-[88dvh] flex-col gap-0 p-0"
        data-testid="add-pharmacy-sheet"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('pharmacies.add')}</SheetTitle>
          <SheetDescription>{t('pharmacies.addHint')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
            {!online && (
              <Alert variant="warning" data-testid="add-pharmacy-offline">
                <WifiOffIcon />
                <AlertDescription>{t('pharmacies.needsConnection')}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-new-name">{t('pharmacies.name')}</Label>
              <Input
                id="pharmacy-new-name"
                value={values.name}
                maxLength={PHARMACY_LIMITS.name}
                onChange={(e) => set({ name: e.target.value })}
                aria-invalid={touched && !!problems.name}
                placeholder={t('pharmacies.namePlaceholder')}
                className="h-11"
              />
              {touched && problems.name && <p className="text-sm text-destructive">{t('forms.required')}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-new-name-ar">{t('pharmacies.nameOther')}</Label>
              <Input
                id="pharmacy-new-name-ar"
                value={values.nameAr}
                maxLength={PHARMACY_LIMITS.name}
                onChange={(e) => set({ nameAr: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-new-town">{t('pharmacies.town')}</Label>
              <TownSelect
                id="pharmacy-new-town"
                towns={towns.data ?? []}
                value={form.townId}
                onChange={(townId) => set({ townId })}
                invalid={touched && !!problems.townId}
              />
              {touched && problems.townId && (
                <p className="text-sm text-destructive">{t('pharmacies.townRequired')}</p>
              )}
              <p className="text-xs text-muted-foreground">{t('pharmacies.townHint')}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-new-address">{t('pharmacies.address')}</Label>
              <Input
                id="pharmacy-new-address"
                value={values.address}
                maxLength={PHARMACY_LIMITS.address}
                onChange={(e) => set({ address: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-new-phone">{t('pharmacies.phone')}</Label>
              <Input
                id="pharmacy-new-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                maxLength={PHARMACY_LIMITS.phone}
                value={values.phone}
                onChange={(e) => set({ phone: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-new-notes">{t('pharmacies.notes')}</Label>
              <Textarea
                id="pharmacy-new-notes"
                rows={2}
                maxLength={PHARMACY_LIMITS.notes}
                value={values.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
            <p
              className="flex items-start gap-2 text-sm text-muted-foreground"
              data-testid="new-pharmacy-location-hint"
            >
              <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t('pharmacies.locationFromFirstVisit')}
            </p>
            {existingId && (
              <Alert variant="warning" data-testid="pharmacy-exists">
                <AlertDescription className="grid gap-2">
                  <p>{t('pharmacies.alreadyExists')}</p>
                  <Button asChild size="sm" className="w-fit">
                    <Link to="/rep/customers/$customerId" params={{ customerId: existingId }} onClick={close}>
                      {t('pharmacies.openExisting')}
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <FormError error={error} />
            <Button type="submit" size="lg" disabled={create.isPending} data-testid="add-pharmacy-save">
              {create.isPending && <Loader2Icon className="animate-spin" />}
              {t('pharmacies.create')}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
