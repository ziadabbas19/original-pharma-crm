/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type LocationVisibility = (typeof LocationVisibility)[keyof typeof LocationVisibility]

export const LocationVisibility = {
  visitOnly: 'visitOnly',
  allDay: 'allDay',
} as const
