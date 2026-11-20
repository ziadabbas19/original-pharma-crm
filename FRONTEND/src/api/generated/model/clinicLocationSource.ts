/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type ClinicLocationSource = (typeof ClinicLocationSource)[keyof typeof ClinicLocationSource] | null

export const ClinicLocationSource = {
  managerSet: 'managerSet',
  firstVisit: 'firstVisit',
} as const
