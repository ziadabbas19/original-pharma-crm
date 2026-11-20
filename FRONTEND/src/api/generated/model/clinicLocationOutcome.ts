/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type ClinicLocationOutcome = (typeof ClinicLocationOutcome)[keyof typeof ClinicLocationOutcome]

export const ClinicLocationOutcome = {
  compared: 'compared',
  savedAsClinic: 'savedAsClinic',
  notSaved: 'notSaved',
} as const
