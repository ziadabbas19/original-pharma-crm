/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type StatsSection = (typeof StatsSection)[keyof typeof StatsSection]

export const StatsSection = {
  orders: 'orders',
  visits: 'visits',
  doctors: 'doctors',
  reps: 'reps',
  catalog: 'catalog',
} as const
