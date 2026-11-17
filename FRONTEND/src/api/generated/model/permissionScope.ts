/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type PermissionScope = (typeof PermissionScope)[keyof typeof PermissionScope]

export const PermissionScope = {
  own: 'own',
  team: 'team',
  territory: 'territory',
  all: 'all',
} as const
