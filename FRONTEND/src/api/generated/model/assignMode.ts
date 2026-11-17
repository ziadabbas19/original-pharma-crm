/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type AssignMode = (typeof AssignMode)[keyof typeof AssignMode]

export const AssignMode = {
  copy: 'copy',
  move: 'move',
} as const
