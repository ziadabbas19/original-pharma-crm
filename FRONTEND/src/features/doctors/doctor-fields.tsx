import { AlertTriangleIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LookupDto, TownDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { localizedName } from '@/lib/format'
import { AvailabilityEditor } from './AvailabilityEditor'
import { DOCTOR_LIMITS, doctorProblems, type DoctorFormValues } from './doctor-form'

/** Town picker grouped by area. */
export function TownSelect({
  id,
  towns,
  value,
  onChange,
  allLabel,
  invalid,
  className,
}: {
  id?: string
  towns: TownDto[]
  value: string
  onChange: (value: string) => void
  /** When set, the empty option reads like a filter ("All"); otherwise "Choose…". */
  allLabel?: string
  invalid?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const groups = useMemo(() => {
    const byArea = new Map<string, { label: string; towns: TownDto[] }>()
    for (const town of towns) {
      const key = town.areaId ?? ''
      const group = byArea.get(key) ?? { label: localizedName(town.areaName, town.areaNameAr), towns: [] }
      group.towns.push(town)
      byArea.set(key, group)
    }
    return [...byArea.values()]
  }, [towns])

  return (
    <NativeSelect
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      className={className}
    >
      <option value="">{allLabel ?? t('orders.form.choose')}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.towns.map((town) => (
            <option key={town.id} value={town.id}>
              {localizedName(town.name, town.nameAr)}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  )
}

export function SpecialtySelect({
  id,
  specialties,
  value,
  onChange,
  allLabel,
  invalid,
  className,
}: {
  id?: string
  specialties: LookupDto[]
  value: string
  onChange: (value: string) => void
  allLabel?: string
  invalid?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <NativeSelect
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      className={className}
    >
      <option value="">{allLabel ?? t('orders.form.choose')}</option>
      {specialties.map((s) => (
        <option key={s.id} value={s.id}>
          {localizedName(s.nameEn, s.nameAr)}
        </option>
      ))}
    </NativeSelect>
  )
}

export function OutsideAreaBadge() {
  const { t } = useTranslation()
  return (
    <Badge variant="warning" title={t('doctors.outsideAreaHint')}>
      <AlertTriangleIcon />
      {t('doctors.outsideArea')}
    </Badge>
  )
}

/** Name, town, specialty, address, landmark, phone, clinic notes and visiting hours. */
export function DoctorFields({
  values,
  onChange,
  towns,
  specialties,
  touched,
  afterTown,
}: {
  values: DoctorFormValues
  onChange: (values: DoctorFormValues) => void
  towns: TownDto[]
  specialties: LookupDto[]
  touched: boolean
  /** Shown right under the name and town (the add forms' "similar ones already exist" warning). */
  afterTown?: ReactNode
}) {
  const { t } = useTranslation()
  const problems = doctorProblems(values, t)
  const set = (patch: Partial<DoctorFormValues>) => onChange({ ...values, ...patch })
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="doctor-name">{t('doctors.name')}</Label>
        <Input
          id="doctor-name"
          value={values.name}
          maxLength={200}
          onChange={(e) => set({ name: e.target.value })}
          aria-invalid={touched && !!problems.name}
          placeholder={t('doctors.namePlaceholder')}
        />
        {touched && problems.name && <p className="text-sm text-destructive">{problems.name}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doctor-name-ar">{t('doctors.nameOther')}</Label>
        <Input
          id="doctor-name-ar"
          value={values.nameAr}
          maxLength={200}
          onChange={(e) => set({ nameAr: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="doctor-town">{t('doctors.town')}</Label>
          <TownSelect
            id="doctor-town"
            towns={towns}
            value={values.townId}
            onChange={(townId) => set({ townId })}
            invalid={touched && !!problems.townId}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="doctor-specialty">{t('doctors.specialty')}</Label>
          <SpecialtySelect
            id="doctor-specialty"
            specialties={specialties}
            value={values.specialtyId}
            onChange={(specialtyId) => set({ specialtyId })}
            invalid={touched && !!problems.specialtyId}
          />
        </div>
      </div>
      {touched && (problems.townId || problems.specialtyId) && (
        <p className="text-sm text-destructive">{t('doctors.townSpecialtyRequired')}</p>
      )}
      {afterTown}
      <div className="grid gap-2">
        <Label htmlFor="doctor-address">{t('doctors.address')}</Label>
        <Input
          id="doctor-address"
          value={values.address}
          maxLength={DOCTOR_LIMITS.address}
          placeholder={t('doctors.addressPlaceholder')}
          onChange={(e) => set({ address: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doctor-landmark">{t('doctors.landmark')}</Label>
        <Input
          id="doctor-landmark"
          value={values.landmark}
          maxLength={DOCTOR_LIMITS.landmark}
          placeholder={t('doctors.landmarkPlaceholder')}
          onChange={(e) => set({ landmark: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doctor-phone">{t('doctors.phone')}</Label>
        <Input
          id="doctor-phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          maxLength={32}
          value={values.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doctor-notes">{t('doctors.notes')}</Label>
        <Textarea
          id="doctor-notes"
          rows={2}
          maxLength={1000}
          value={values.notes}
          placeholder={t('doctors.notesPlaceholder')}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
      <AvailabilityEditor slots={values.slots} onChange={(slots) => set({ slots })} touched={touched} />
    </div>
  )
}
