/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { JsonElement } from './jsonElement'
import type { NotificationType } from './notificationType'

export interface NotificationDto {
  id: string
  type: NotificationType
  /** @nullable */
  entityId: string | null
  data: JsonElement
  createdAt: string
  /** @nullable */
  readAt: string | null
}
