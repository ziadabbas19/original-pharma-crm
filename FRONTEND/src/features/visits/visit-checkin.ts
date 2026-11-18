import { platform, type GeoFix } from '@/lib/platform'

/**
 * Check-in and check-out are the only moments the app asks for a high-accuracy fix;
 * regular tracking stays on balanced accuracy.
 */
export function captureVisitFix(): Promise<GeoFix> {
  return platform().location.getCurrentPosition({ highAccuracy: true, timeoutMs: 20_000 })
}
