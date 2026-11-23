import type { CreateDoctorRequest } from '@/api/generated/model'
import { toSlotInputs, type SlotValue } from './availability'

/** Values of the doctor form (shared by the add sheet and the edit dialog). */
export interface DoctorFormValues {
  name: string
  nameAr: string
  townId: string
  specialtyId: string
  phone: string
  notes: string
  address: string
  landmark: string
  slots: SlotValue[]
}

export const EMPTY_DOCTOR: DoctorFormValues = {
  name: '',
  nameAr: '',
  townId: '',
  specialtyId: '',
  phone: '',
  notes: '',
  address: '',
  landmark: '',
  slots: [],
}

/** Same limits as the server. */
export const DOCTOR_LIMITS = { address: 500, landmark: 200 } as const

export function doctorProblems(values: DoctorFormValues, t: (key: string) => string) {
  return {
    name: values.name.trim() === '' ? t('forms.required') : undefined,
    townId: values.townId === '' ? t('forms.required') : undefined,
    specialtyId: values.specialtyId === '' ? t('forms.required') : undefined,
  }
}

/** The create request from the form values (the rep's own list unless a rep is given). */
export function toCreateDoctorRequest(values: DoctorFormValues, repId?: string): CreateDoctorRequest {
  return {
    name: values.name.trim(),
    nameAr: values.nameAr.trim() || null,
    townId: values.townId,
    specialtyId: values.specialtyId,
    phone: values.phone.trim() || null,
    notes: values.notes.trim() || null,
    address: values.address.trim() || null,
    landmark: values.landmark.trim() || null,
    availability: toSlotInputs(values.slots),
    ...(repId ? { repId } : {}),
  }
}
