/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface DoctorLocationInput {
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  geofenceRadiusMeters?: number
}
