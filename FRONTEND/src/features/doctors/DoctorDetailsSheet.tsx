import { LandmarkIcon, MapPinIcon, PencilIcon, PhoneIcon, UserRoundPlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDoctorsGet } from '@/api/generated/endpoints'
import type { DoctorDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { localizedName } from '@/lib/format'
import { DoctorSchedule } from './DoctorSchedule'

/** A doctor's details for managers: address, landmark, visiting hours, reps and who added the doctor. */
export function DoctorDetailsSheet({
  doctor: initial,
  onClose,
  onEdit,
}: {
  doctor: DoctorDto
  onClose: () => void
  onEdit?: (doctor: DoctorDto) => void
}) {
  const { t } = useTranslation()
  // The list row is shown at once; the fresh copy replaces it when it arrives.
  const fresh = useDoctorsGet(initial.id, { query: { staleTime: 0 } })
  const doctor = fresh.data ?? initial
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="doctor-details">
        <DialogHeader>
          <DialogTitle>{localizedName(doctor.name, doctor.nameAr)}</DialogTitle>
          <DialogDescription>
            {[
              localizedName(doctor.specialtyNameEn, doctor.specialtyNameAr),
              localizedName(doctor.townName, doctor.townNameAr),
            ]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          {doctor.address && (
            <p className="flex items-start gap-1.5" data-testid="doctor-details-address">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {doctor.address}
            </p>
          )}
          {doctor.landmark && (
            <p className="flex items-start gap-1.5" data-testid="doctor-details-landmark">
              <LandmarkIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t('doctors.landmarkLine', { landmark: doctor.landmark })}
            </p>
          )}
          {doctor.phone && (
            <p className="flex items-center gap-1.5">
              <PhoneIcon className="size-4 shrink-0 text-primary" aria-hidden />
              <a
                href={`tel:${doctor.phone.replace(/\s+/g, '')}`}
                dir="ltr"
                className="text-primary hover:underline"
              >
                {doctor.phone}
              </a>
            </p>
          )}
          {doctor.notes && <p className="whitespace-pre-line text-muted-foreground">{doctor.notes}</p>}
          <DoctorSchedule slots={doctor.availability} className="border-t pt-3" />
          <div className="grid gap-1.5 border-t pt-3">
            <p className="font-semibold">{t('doctors.inListsOf')}</p>
            {doctor.reps.length === 0 ? (
              <p className="text-muted-foreground">{t('doctors.unassigned')}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {doctor.reps.map((r) => (
                  <Badge key={r.id} variant={r.outsideArea ? 'warning' : 'secondary'}>
                    {r.fullName}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <p
            className="flex items-center gap-1.5 text-muted-foreground"
            data-testid="doctor-details-added-by"
          >
            <UserRoundPlusIcon className="size-4 shrink-0" aria-hidden />
            {t('doctors.addedBy', { name: doctor.createdByName ?? t('doctors.notRecorded') })}
          </p>
        </div>
        {onEdit && !doctor.archivedAt && (
          <Button variant="outline" size="lg" className="w-full" onClick={() => onEdit(doctor)}>
            <PencilIcon />
            {t('doctors.edit')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
