import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/features/auth/usePermission'
import { LocationMap, type MapPoint } from '@/features/maps/LazyLocationMap'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { handleError, inlineErrors } from '@/lib/errors'
import { formatDateTime, formatDistance } from '@/lib/format'
import { P } from '@/lib/permissions'
import { DoctorFields } from './doctor-fields'
import { doctorProblems, type DoctorFormValues } from './doctor-form'

/** Edit a doctor's details (own list, or customers:manage within scope). Render with a key per doctor. */
export function DoctorEditDialog({ doctor, onClose }: { doctor: DoctorDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const update = useDoctorsUpdate(inlineErrors)
  const { towns, specialties } = useDoctorReferenceData()
  const [values, setValues] = useState<DoctorFormValues>({
    name: doctor.name,
    nameAr: doctor.nameAr ?? '',
    townId: doctor.townId ?? '',
    specialtyId: doctor.specialtyId ?? '',
    phone: doctor.phone ?? '',
    notes: doctor.notes ?? '',
  })
  const canSetLocation = usePermission(P.customers.manage)
  const [lat, setLat] = useState(doctor.lat?.toString() ?? '')
  const [lng, setLng] = useState(doctor.lng?.toString() ?? '')
  const [radius, setRadius] = useState(String(doctor.geofenceRadiusMeters ?? 150))
  const [active, setActive] = useState(doctor.isActive)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const latValue = lat.trim() === '' ? null : Number(lat)
  const lngValue = lng.trim() === '' ? null : Number(lng)
  const radiusValue = Number(radius)
  const locationInvalid =
    canSetLocation &&
    ((latValue === null) !== (lngValue === null) ||
      (latValue !== null && !(Math.abs(latValue) <= 90)) ||
      (lngValue !== null && !(Math.abs(lngValue) <= 180)) ||
      !Number.isInteger(radiusValue) ||
      radiusValue < 20 ||
      radiusValue > 2000)

  // The map follows the typed coordinates once they are valid.
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      latValue !== null && lngValue !== null && Math.abs(latValue) <= 90 && Math.abs(lngValue) <= 180
        ? [
            {
              id: 'clinic',
              lat: latValue,
              lng: lngValue,
              kind: 'clinic',
              title: t('doctors.locationHistory.clinic'),
            },
          ]
        : [],
    [latValue, lngValue, t],
  )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const problems = doctorProblems(values, t)
    if (problems.name || problems.townId || problems.specialtyId || locationInvalid) return
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
          ...(canSetLocation
            ? { location: { lat: latValue, lng: lngValue, geofenceRadiusMeters: radiusValue } }
            : {}),
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'doctors.edit' }))
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
          {canSetLocation && (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t('doctors.location')}</legend>
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="doctor-lat">{t('doctors.lat')}</Label>
                  <Input
                    id="doctor-lat"
                    dir="ltr"
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="doctor-lng">{t('doctors.lng')}</Label>
                  <Input
                    id="doctor-lng"
                    dir="ltr"
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="doctor-radius">{t('doctors.radius')}</Label>
                  <Input
                    id="doctor-radius"
                    dir="ltr"
                    inputMode="numeric"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                  />
                </div>
              </div>
              <p
                className={
                  locationInvalid && touched ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'
                }
              >
                {t('doctors.locationHint')}
              </p>
              {mapPoints.length > 0 ? (
                <LocationMap
                  points={mapPoints}
                  radiusMeters={Number.isInteger(radiusValue) ? radiusValue : undefined}
                  className="relative h-44 overflow-hidden rounded-xl border"
                />
              ) : (
                <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  {t('doctors.locationHistory.pending')}
                </p>
              )}
              {doctor.lat != null && doctor.locationSource && (
                <p className="text-xs text-muted-foreground" data-testid="doctor-location-source">
                  {t('doctors.locationHistory.sourceLine', {
                    source: t(`doctors.locationSources.${doctor.locationSource}`),
                    name: doctor.locationCapturedByName ?? '—',
                    time: formatDateTime(doctor.locationCapturedAt),
                  })}
                  {doctor.locationAccuracyMeters != null &&
                    ` · ±${formatDistance(Math.round(doctor.locationAccuracyMeters))}`}
                </p>
              )}
            </fieldset>
          )}
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
