import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2Icon, MapPinPlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getCustomersListQueryKey,
  useCustomersCreateHospital,
  useCustomersHospitalTowns,
} from '@/api/generated/endpoints'
import type { CustomerDto, SimilarCustomerDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { TownSelect } from '@/features/doctors/doctor-fields'
import { handleError, inlineErrors } from '@/lib/errors'
import { writeCache } from '@/lib/offline-cache'
import { PHARMACY_LIMITS } from './pharmacy-form'
import { duplicateCandidates } from './similar-customers'
import { OpenCandidateButton, SimilarCustomersNotice } from './SimilarCustomersNotice'
import { useSimilarCustomers } from './use-similar-customers'

interface PlaceValues {
  name: string
  nameAr: string
  townId: string
  address: string
  landmark: string
  phone: string
  notes: string
  repId: string
}

const EMPTY: PlaceValues = {
  name: '',
  nameAr: '',
  townId: '',
  address: '',
  landmark: '',
  phone: '',
  notes: '',
  repId: '',
}
const LANDMARK_MAX = 200

/**
 * Add an AM place (a hospital visited in the morning) with the pharmacy rules: a rep in a town of their
 * area, a manager inside their scope, optionally on a rep's list. No location now: the first visit saves it.
 * Look-alike places of the town are shown while typing.
 */
export function AddPlaceSheet({
  open,
  onOpenChange,
  onAdded,
  reps,
  onOpenExisting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (place: CustomerDto) => void
  /** Reps the manager may put the place on (omit in the rep app). */
  reps?: { id: string; name: string }[]
  /** "Open" on a look-alike place (management screens); the rep app opens the place's page. */
  onOpenExisting?: (place: SimilarCustomerDto & { id: string }) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const towns = useCustomersHospitalTowns({ query: { enabled: open, staleTime: 5 * 60_000 } })
  const create = useCustomersCreateHospital(inlineErrors)
  const [values, setValues] = useState<PlaceValues>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [exists, setExists] = useState(false)
  const onlyTown = towns.data?.length === 1 ? towns.data[0].id : ''
  const form = { ...values, townId: values.townId || onlyTown }
  const missingName = form.name.trim() === ''
  const missingTown = form.townId === ''
  const [conflict, setConflict] = useState<SimilarCustomerDto[] | null>(null)
  const live = useSimilarCustomers({
    type: 'hospital',
    name: form.name || form.nameAr,
    townId: form.townId,
    phone: form.phone,
    enabled: open,
  })
  const candidates = conflict ?? live
  const set = (patch: Partial<PlaceValues>) => {
    setConflict(null)
    setValues((v) => ({ ...v, ...patch }))
  }

  const close = () => {
    setValues(EMPTY)
    setTouched(false)
    setError(null)
    setExists(false)
    setConflict(null)
    onOpenChange(false)
  }

  /** Saves the place; `confirmed` after "Add anyway" next to look-alike places. */
  const submit = async (e?: FormEvent, confirmed = false) => {
    e?.preventDefault()
    setTouched(true)
    setError(null)
    setExists(false)
    if (missingName || missingTown) return
    const optional = (value: string) => value.trim() || null
    try {
      const place = await create.mutateAsync({
        data: {
          name: form.name.trim(),
          nameAr: optional(form.nameAr),
          territoryId: form.townId,
          address: optional(form.address),
          landmark: optional(form.landmark),
          phone: optional(form.phone),
          notes: optional(form.notes),
          repId: form.repId || null,
          duplicateConfirmed: confirmed,
        },
      })
      const listed = queryClient.getQueryData<CustomerDto[]>(getCustomersListQueryKey({ type: 'hospital' }))
      if (listed)
        writeCache(
          'my-places',
          [...listed, place].sort((a, b) => a.name.localeCompare(b.name)),
        )
      await queryClient.invalidateQueries({ queryKey: ['/api/customers'] })
      onAdded?.(place)
      close()
    } catch (err) {
      const failure = handleError(err, { silent: true, context: 'places.add' })
      const similar = duplicateCandidates(failure)
      if (similar) setConflict(similar)
      else if (failure.code === 'hospital_exists') setExists(true)
      else setError(failure)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-0 p-0" data-testid="add-place-sheet">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('places.add')}</SheetTitle>
          <SheetDescription>{t('places.addHint')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <form
            className="grid gap-4 [&_input]:h-11 [&_select]:h-11"
            noValidate
            onSubmit={(e) => void submit(e)}
          >
            <div className="grid gap-2">
              <Label htmlFor="place-name">{t('places.name')}</Label>
              <Input
                id="place-name"
                value={values.name}
                maxLength={PHARMACY_LIMITS.name}
                onChange={(e) => set({ name: e.target.value })}
                aria-invalid={touched && missingName}
                placeholder={t('places.namePlaceholder')}
              />
              {touched && missingName && <p className="text-sm text-destructive">{t('forms.required')}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="place-name-ar">{t('places.nameOther')}</Label>
              <Input
                id="place-name-ar"
                value={values.nameAr}
                maxLength={PHARMACY_LIMITS.name}
                onChange={(e) => set({ nameAr: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="place-town">{t('places.town')}</Label>
              <TownSelect
                id="place-town"
                towns={towns.data ?? []}
                value={form.townId}
                onChange={(townId) => set({ townId })}
                invalid={touched && missingTown}
              />
              {touched && missingTown && (
                <p className="text-sm text-destructive">{t('places.townRequired')}</p>
              )}
            </div>
            <SimilarCustomersNotice
              candidates={candidates}
              adding={create.isPending}
              onAddAnyway={() => void submit(undefined, true)}
              action={(c) =>
                onOpenExisting ? (
                  <OpenCandidateButton
                    onClick={() => {
                      onOpenExisting(c)
                      close()
                    }}
                  />
                ) : (
                  <OpenCandidateButton>
                    <Link to="/rep/customers/$customerId" params={{ customerId: c.id }} onClick={close}>
                      {t('similar.open')}
                    </Link>
                  </OpenCandidateButton>
                )
              }
            />
            {reps && reps.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="place-rep">{t('places.rep')}</Label>
                <NativeSelect
                  id="place-rep"
                  value={values.repId}
                  onChange={(e) => set({ repId: e.target.value })}
                >
                  <option value="">{t('places.noRep')}</option>
                  {reps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{t('places.repHint')}</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="place-address">{t('places.address')}</Label>
              <Input
                id="place-address"
                value={values.address}
                maxLength={PHARMACY_LIMITS.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="place-landmark">{t('places.landmark')}</Label>
              <Input
                id="place-landmark"
                value={values.landmark}
                maxLength={LANDMARK_MAX}
                placeholder={t('doctors.landmarkPlaceholder')}
                onChange={(e) => set({ landmark: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="place-phone">{t('places.phone')}</Label>
              <Input
                id="place-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                maxLength={PHARMACY_LIMITS.phone}
                value={values.phone}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="place-notes">{t('places.notes')}</Label>
              <Textarea
                id="place-notes"
                rows={2}
                maxLength={PHARMACY_LIMITS.notes}
                value={values.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t('places.locationFromFirstVisit')}
            </p>
            {exists && (
              <Alert variant="warning" data-testid="place-exists">
                <AlertDescription>{t('places.alreadyExists')}</AlertDescription>
              </Alert>
            )}
            <FormError error={error} />
            <Button type="submit" size="lg" disabled={create.isPending} data-testid="add-place-save">
              {create.isPending && <Loader2Icon className="animate-spin" />}
              {t('places.create')}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
