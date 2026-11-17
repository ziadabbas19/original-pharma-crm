import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDoctorsUpdate } from '@/api/generated/endpoints'
import type { DoctorDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { DoctorFields } from './doctor-fields'
import { doctorProblems, type DoctorFormValues } from './doctor-form'

/** Edit a doctor's details (own list, or customers:manage within scope). Render with a key per doctor. */
export function DoctorEditDialog({ doctor, onClose }: { doctor: DoctorDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const update = useDoctorsUpdate()
  const { towns, specialties } = useDoctorReferenceData()
  const [values, setValues] = useState<DoctorFormValues>({
    name: doctor.name,
    nameAr: doctor.nameAr ?? '',
    townId: doctor.townId ?? '',
    specialtyId: doctor.specialtyId ?? '',
    phone: doctor.phone ?? '',
    notes: doctor.notes ?? '',
  })
  const [active, setActive] = useState(doctor.isActive)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const problems = doctorProblems(values, t)
    if (problems.name || problems.townId || problems.specialtyId) return
    try {
      await update.mutateAsync({
        id: doctor.id,
        data: {
          name: values.name.trim(),
          nameAr: values.nameAr.trim() || null,
          townId: values.townId,
          specialtyId: values.specialtyId,
          phone: values.phone.trim() || null,
          notes: values.notes.trim() || null,
          isActive: active,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('doctors.edit')}</DialogTitle>
          <DialogDescription>{t('doctors.editHint')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <DoctorFields
            values={values}
            onChange={setValues}
            towns={towns.data ?? []}
            specialties={specialties.data ?? []}
            touched={touched}
          />
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t('doctors.active')}
          </Label>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2Icon className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
