import { visitsCheckIn, visitsCheckOut } from '@/api/generated/endpoints'
import type { VisitDto } from '@/api/generated/model'
import { platform } from '@/lib/platform'

/**
 * Visit check-in/out. These are the only moments the app asks for a
 * high-accuracy fix; regular tracking stays on balanced accuracy.
 * TODO: rep visit screen (customer picker, QR scanner, photo capture) will call these.
 */
export async function checkInToVisit(customerId: string, qrPayload?: string): Promise<VisitDto> {
  const p = platform()
  const [fix, info] = await Promise.all([p.location.getCurrentPosition({ highAccuracy: true }), p.app.info()])
  return visitsCheckIn({
    customerId,
    deviceId: info.deviceId,
    lat: fix.lat,
    lng: fix.lng,
    accuracy: fix.accuracy,
    timestamp: fix.timestamp,
    isMock: fix.isMock,
    qrPayload: qrPayload ?? null,
  })
}

export async function checkOutOfVisit(visitId: string, notes?: string): Promise<VisitDto> {
  const fix = await platform().location.getCurrentPosition({ highAccuracy: true })
  return visitsCheckOut(visitId, {
    lat: fix.lat,
    lng: fix.lng,
    accuracy: fix.accuracy,
    timestamp: fix.timestamp,
    isMock: fix.isMock,
    notes: notes ?? null,
  })
}
