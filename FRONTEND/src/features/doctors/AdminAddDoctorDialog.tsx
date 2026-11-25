import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, MapPinPlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { doctorsAddToMyList, doctorsAssign, useDoctorsCreate } from '@/api/generated/endpoints'
import type { SimilarCustomerDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { duplicateCandidates } from '@/features/customers/similar-customers'
import { SameDoctorButton, SimilarCustomersNotice } from '@/features/customers/SimilarCustomersNotice'
import { useSimilarCustomers } from '@/features/customers/use-similar-customers'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { handleError, inlineErrors } from '@/lib/errors'
import { toast } from '@/lib/toast'
import { slotProblems } from './availability'
import { DoctorFields } from './doctor-fields'
import { doctorProblems, EMPTY_DOCTOR, toCreateDoctorRequest, type DoctorFormValues } from './doctor-form'

/**
 * Add a doctor from the management screens (customers:create). With customers:assign the manager picks
 * the rep the doctor goes to (reps in their scope); otherwise it goes on their own list. Look-alike
 * doctors of the chosen town are offered first: the same doctor goes on that list instead of a new one.
 */
export function AdminAddDoctorDialog({
  reps,
  defaultRepId,
  onClose,
}: {
  /** Reps the caller may assign to; empty when the caller cannot assign. */
  reps: { id: string; name: string }[]
  defaultRepId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { towns, specialties } = useDoctorReferenceData()
  const create = useDoctorsCreate(inlineErrors)
  const [values, setValues] = useState<DoctorFormValues>(EMPTY_DOCTOR)
  const [repId, setRepId] = useState(defaultRepId ?? '')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [exists, setExists] = useState(false)
  const [conflict, setConflict] = useState<SimilarCustomerDto[] | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const live = useSimilarCustomers({
    type: 'doctor',
    name: values.name || values.nameAr,
    townId: values.townId,
    phone: values.phone,
    enabled: true,
  })
  const candidates = conflict ?? live
  const change = (next: DoctorFormValues) => {
    setConflict(null)
    setValues(next)
  }

  /** Saves the new doctor; `confirmed` after "Add anyway" next to look-alike doctors. */
  const submit = async (e?: FormEvent, confirmed = false) => {
    e?.preventDefault()
    setTouched(true)
    setError(null)
    setExists(false)
    const problems = doctorProblems(values, t)
    if (problems.name || problems.townId || problems.specialtyId || slotProblems(values.slots).some(Boolean))
      return
    try {
      await create.mutateAsync({
        data: { ...toCreateDoctorRequest(values, repId || undefined), duplicateConfirmed: confirmed },
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
      onClose()
    } catch (err) {
      const failure = handleError(err, { silent: true, context: 'doctors.create' })
      const similar = duplicateCandidates(failure)
      if (similar) setConflict(similar)
      else if (failure.code === 'doctor_exists') setExists(true)
      else setError(failure)
    }
  }

  /** The existing doctor goes on the chosen rep's list (customers:assign), or on the caller's own. */
  const takeExisting = async (doctorId: string) => {
    setError(null)
    setLinking(doctorId)
    try {
      if (repId) await doctorsAssign({ doctorIds: [doctorId], toRepId: repId, mode: 'copy' })
      else await doctorsAddToMyList(doctorId)
      await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
      toast.show({
        tone: 'success',
        message: repId ? t('similar.addedToRepList') : t('doctors.addedToMyList'),
      })
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'doctors.create' }))
    } finally {
      setLinking(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="admin-add-doctor">
        <DialogHeader>
          <DialogTitle>{t('doctors.add')}</DialogTitle>
          <DialogDescription>{t('doctors.create.hint')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 [&_input]:h-11 [&_select]:h-11"
          noValidate
          onSubmit={(e) => void submit(e)}
        >
          {reps.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="doctor-rep">{t('doctors.create.rep')}</Label>
              <NativeSelect id="doctor-rep" value={repId} onChange={(e) => setRepId(e.target.value)}>
                <option value="">{t('doctors.create.ownList')}</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t('doctors.create.repHint')}</p>
            </div>
          )}
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
                onAddAnyway={() => void submit(undefined, true)}
                action={(c) => (
                  <SameDoctorButton
                    forRep={!!repId}
                    busy={linking === c.id}
                    onClick={() => void takeExisting(c.id)}
                  />
                )}
              />
            }
          />
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPinPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {t('doctors.locationFromFirstVisit')}
          </p>
          {exists && (
            <Alert variant="warning" data-testid="admin-doctor-exists">
              <AlertDescription>{t('errors.doctor_exists')}</AlertDescription>
            </Alert>
          )}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="admin-add-doctor-save">
              {create.isPending && <Loader2Icon className="animate-spin" />}
              {t('doctors.create.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
