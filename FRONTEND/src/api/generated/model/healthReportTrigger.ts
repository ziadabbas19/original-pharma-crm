/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type HealthReportTrigger = (typeof HealthReportTrigger)[keyof typeof HealthReportTrigger]

export const HealthReportTrigger = {
  onboarding: 'onboarding',
  appOpen: 'appOpen',
  resume: 'resume',
  manual: 'manual',
  periodic: 'periodic',
} as const
