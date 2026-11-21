import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useCustomersUpdate } from '@/api/generated/endpoints'
import type { CustomerDto } from '@/api/generated/model'
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
import { Textarea } from '@/components/ui/textarea'
import { TownSelect } from '@/features/doctors/doctor-fields'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { handleError, inlineErrors } from '@/lib/errors'

/** Edit a pharmacy: names, address, town, phone, location and geofence. */
export function PharmacyEditDialog({ customer, onClose }: { customer: CustomerDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const update = useCustomersUpdate(inlineErrors)
  const { towns } = useDoctorReferenceData()
  const [name, setName] = useState(customer.name)
  const [nameAr, setNameAr] = useState(customer.nameAr ?? '')
  const [address, setAddress] = useState(customer.address ?? '')
  const [townId, setTownId] = useState(customer.territoryId ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [lat, setLat] = useState(customer.lat?.toString() ?? '')
  const [lng, setLng] = useState(customer.lng?.toString() ?? '')
  const [radius, setRadius] = useState(String(customer.geofenceRadiusMeters))
  const [active, setActive] = useState(customer.isActive)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const latValue = lat.trim() === '' ? null : Number(lat)
  const lngValue = lng.trim() === '' ? null : Number(lng)
  const radiusValue = Number(radius)
  const locationInvalid =
    (latValue === null) !== (lngValue === null) ||
    (latValue !== null && !(Math.abs(latValue) <= 90)) ||
    (lngValue !== null && !(Math.abs(lngValue) <= 180))
  const radiusInvalid = !Number.isInteger(radiusValue) || radiusValue < 20 || radiusValue > 2000

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!name.trim() || locationInvalid || radiusInvalid) return
    try {
      await update.mutateAsync({
        id: customer.id,
        data: {
          name: name.trim(),
          nameAr: nameAr.trim() || null,
          address: address.trim() || null,
          territoryId: townId || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          lat: latValue,
          lng: lngValue,
          geofenceRadiusMeters: radiusValue,
          isActive: active,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/customers'] })
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'pharmacies.edit' }))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('customers.editPharmacy')}</DialogTitle>
          <DialogDescription>{t('customers.editPharmacyHint')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-name">{t('catalog.nameEn')}</Label>
              <Input
                id="pharmacy-name"
                dir="ltr"
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={touched && !name.trim()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-name-ar">{t('catalog.nameAr')}</Label>
              <Input
                id="pharmacy-name-ar"
                dir="rtl"
                maxLength={200}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-town">{t('doctors.town')}</Label>
              <TownSelect id="pharmacy-town" towns={towns.data ?? []} value={townId} onChange={setTownId} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-phone">{t('doctors.phone')}</Label>
              <Input
                id="pharmacy-phone"
                dir="ltr"
                inputMode="tel"
                maxLength={32}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pharmacy-address">{t('customers.address')}</Label>
            <Input
              id="pharmacy-address"
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-lat">{t('customers.latitude')}</Label>
              <Input
                id="pharmacy-lat"
                dir="ltr"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                aria-invalid={touched && locationInvalid}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-lng">{t('customers.longitude')}</Label>
              <Input
                id="pharmacy-lng"
                dir="ltr"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                aria-invalid={touched && locationInvalid}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pharmacy-radius">{t('customers.radius')}</Label>
              <Input
                id="pharmacy-radius"
                dir="ltr"
                inputMode="numeric"
                value={radius}
                onChange={(e) => setRadius(e.target.value.replace(/[^0-9]/g, ''))}
                aria-invalid={touched && radiusInvalid}
              />
            </div>
          </div>
          {touched && locationInvalid && (
            <p className="text-sm text-destructive">{t('customers.locationInvalid')}</p>
          )}
          {touched && radiusInvalid && (
            <p className="text-sm text-destructive">{t('customers.radiusInvalid')}</p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="pharmacy-notes">{t('doctors.notes')}</Label>
            <Textarea
              id="pharmacy-notes"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t('catalog.active')}
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
