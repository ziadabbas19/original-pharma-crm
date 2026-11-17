/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { AssignMode } from './assignMode'

export interface AssignDoctorsRequest {
  doctorIds: string[]
  toRepId: string
  mode: AssignMode
  /** @nullable */
  fromRepId?: string | null
}
