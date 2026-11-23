/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DoctorSlotInput } from './doctorSlotInput'

export interface CreateDoctorRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  townId: string
  specialtyId: string
  /** @nullable */
  phone?: string | null
  /** @nullable */
  notes?: string | null
  /** @nullable */
  repId?: string | null
  /** @nullable */
  address?: string | null
  /** @nullable */
  landmark?: string | null
  /** @nullable */
  availability?: DoctorSlotInput[] | null
}
