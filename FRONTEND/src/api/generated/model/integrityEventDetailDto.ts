/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { IntegrityEventDto } from './integrityEventDto'
import type { IntegrityPointDto } from './integrityPointDto'
import type { IntegrityVisitDto } from './integrityVisitDto'

export interface IntegrityEventDetailDto {
  event: IntegrityEventDto
  points: IntegrityPointDto[]
  visit: null | IntegrityVisitDto
}
