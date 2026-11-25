/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface NoteDto {
  id: string
  clientRequestId: string
  /** @nullable */
  title: string | null
  body: string
  /** @nullable */
  remindAt: string | null
  /** @nullable */
  remindBeforeMinutes: number | null
  /** @nullable */
  notifyAt: string | null
  /** @nullable */
  notifiedAt: string | null
  /** @nullable */
  doneAt: string | null
  createdAt: string
  updatedAt: string
}
