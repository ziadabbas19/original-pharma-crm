import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, MapPinPlusIcon, PlusIcon, SearchIcon, UserPlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDoctorsAddToMyList, useDoctorsCreate, useDoctorsSearchDirectory } from '@/api/generated/endpoints'
import type { DoctorDto, SimilarCustomerDto } from '@/api/generated/model'
import { EmptyState, FormError, Spinner } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { handleError, inlineErrors } from '@/lib/errors'
import { localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { duplicateCandidates } from '@/features/customers/similar-customers'
import { SameDoctorButton, SimilarCustomersNotice } from '@/features/customers/SimilarCustomersNotice'
import { useSimilarCustomers } from '@/features/customers/use-similar-customers'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { slotProblems } from './availability'
import { DoctorFields, OutsideAreaBadge } from './doctor-fields'
import { doctorProblems, EMPTY_DOCTOR, toCreateDoctorRequest, type DoctorFormValues } from './doctor-form'

/**
 * Add a doctor to your own list: pick an existing one (avoids duplicates) or create a new one. While the
 * new doctor's name is typed, look-alike doctors of the chosen town are offered first.
 */
export function AddDoctorSheet({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (doctor: DoctorDto) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { towns, specialties } = useDoctorReferenceData()
  const [tab, setTab] = useState<'find' | 'new'>('find')
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim(), 300)
  const directory = useDoctorsSearchDirectory(
    { search: term },
    { query: { enabled: open && tab === 'find' && term.length >= 2 } },
  )
  const add = useDoctorsAddToMyList(inlineErrors)
  const create = useDoctorsCreate(inlineErrors)
  const [values, setValues] = useState<DoctorFormValues>(EMPTY_DOCTOR)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  // Candidates from a refused save (409 duplicate_suspected); the live check takes over on the next change.
  const [conflict, setConflict] = useState<SimilarCustomerDto[] | null>(null)
  const live = useSimilarCustomers({
    type: 'doctor',
    name: values.name || values.nameAr,
    townId: values.townId,
    phone: values.phone,
    enabled: open && tab === 'new',
  })
  const candidates = conflict ?? live
  const change = (next: DoctorFormValues) => {
    setConflict(null)
    setValues(next)
  }

  const finish = async (doctor: DoctorDto) => {
    await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
    onAdded(doctor)
    setValues(EMPTY_DOCTOR)
    setTouched(false)
    setSearch('')
    setExistingId(null)
    setConflict(null)
    onOpenChange(false)
  }

  const addExisting = async (id: string) => {
    setError(null)
    try {
      await finish(await add.mutateAsync({ id }))
    } catch (e) {
      setError(handleError(e, { silent: true, context: 'doctors.add' }))
    }
  }

  /** Saves the new doctor; `confirmed` after "Add anyway" next to look-alike doctors. */
  const submitNew = async (e?: FormEvent, confirmed = false) => {
    e?.preventDefault()
    setTouched(true)
    setError(null)
    setExistingId(null)
    const problems = doctorProblems(values, t)
    if (problems.name || problems.townId || problems.specialtyId || slotProblems(values.slots).some(Boolean))
      return
    try {
      await finish(
        await create.mutateAsync({
          data: { ...toCreateDoctorRequest(values), duplicateConfirmed: confirmed },
        }),
      )
    } catch (err) {
      const failure = handleError(err, { silent: true, context: 'doctors.add' })
      const similar = duplicateCandidates(failure)
      // The doctor is already known: offer the existing record instead of an error.
      if (similar) {
        setConflict(similar)
      } else if (failure.code === 'doctor_exists' && typeof failure.details.doctorId === 'string') {
        setExistingId(failure.details.doctorId)
      } else {
        setError(failure)
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('doctors.add')}</SheetTitle>
          <SheetDescription>{t('doctors.addHint')}</SheetDescription>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(['find', 'new'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  'rounded-md py-1.5 text-sm font-medium text-muted-foreground',
                  tab === value && 'bg-background text-foreground shadow-xs',
                )}
              >
                {t(`doctors.tabs.${value}`)}
              </button>
            ))}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'find' ? (
            <div className="grid gap-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  autoFocus
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('doctors.directorySearch')}
                  aria-label={t('doctors.directorySearch')}
                  className="ps-9"
                />
              </div>
              <FormError error={error} />
              {term.length < 2 ? (
                <p className="text-center text-sm text-muted-foreground">{t('doctors.typeToSearch')}</p>
              ) : directory.isLoading ? (
                <Spinner />
              ) : (directory.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('doctors.noDirectoryMatch')}
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setValues({ ...EMPTY_DOCTOR, name: search.trim() })
                        setTab('new')
                      }}
                    >
                      <UserPlusIcon />
                      {t('doctors.createInstead')}
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {(directory.data ?? []).map((d) => (
                    <li key={d.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{localizedName(d.name, d.nameAr)}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[
                            localizedName(d.specialtyNameEn, d.specialtyNameAr),
                            localizedName(d.townName, d.townNameAr),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {(d.address || d.landmark) && (
                          <p className="truncate text-sm text-muted-foreground">
                            {[d.address, d.landmark].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {d.outsideMyArea && <OutsideAreaBadge />}
                      </div>
                      {d.onMyList ? (
                        <Badge variant="secondary">{t('doctors.onMyList')}</Badge>
                      ) : (
                        <Button size="sm" onClick={() => void addExisting(d.id)} disabled={add.isPending}>
                          {add.isPending && add.variables?.id === d.id ? (
                            <Loader2Icon className="animate-spin" />
                          ) : (
                            <PlusIcon />
                          )}
                          {t('doctors.addToList')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <form className="grid gap-4" noValidate onSubmit={(e) => void submitNew(e)}>
              <DoctorFields
                values={values}
                onChange={change}
                towns={towns.data ?? []}
                specialties={specialties.data ?? []}
                touched={touched}
                afterTown={
                  <SimilarCustomersNotice
                    candidates={candidates}
                    adding={create.isPending}
                    onAddAnyway={() => void submitNew(undefined, true)}
                    action={(c) => (
                      <SameDoctorButton
                        busy={add.isPending && add.variables?.id === c.id}
                        onClick={() => void addExisting(c.id)}
                      />
                    )}
                  />
                }
              />
              <p
                className="flex items-start gap-2 text-sm text-muted-foreground"
                data-testid="new-doctor-location-hint"
              >
                <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {t('doctors.locationFromFirstVisit')}
              </p>
              {existingId && (
                <Alert variant="warning">
                  <AlertDescription className="grid gap-2">
                    <p>{t('doctors.alreadyExists')}</p>
                    <Button
                      size="sm"
                      className="w-fit"
                      onClick={() => void addExisting(existingId)}
                      disabled={add.isPending}
                    >
                      {t('doctors.addExisting')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <FormError error={error} />
              <Button type="submit" size="lg" disabled={create.isPending}>
                {create.isPending && <Loader2Icon className="animate-spin" />}
                {t('doctors.createAndAdd')}
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
