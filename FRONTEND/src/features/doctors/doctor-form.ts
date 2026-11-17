/** Values of the doctor form (shared by the add sheet and the edit dialog). */
export interface DoctorFormValues {
  name: string
  nameAr: string
  townId: string
  specialtyId: string
  phone: string
  notes: string
}

export const EMPTY_DOCTOR: DoctorFormValues = {
  name: '',
  nameAr: '',
  townId: '',
  specialtyId: '',
  phone: '',
  notes: '',
}

export function doctorProblems(values: DoctorFormValues, t: (key: string) => string) {
  return {
    name: values.name.trim() === '' ? t('forms.required') : undefined,
    townId: values.townId === '' ? t('forms.required') : undefined,
    specialtyId: values.specialtyId === '' ? t('forms.required') : undefined,
  }
}
