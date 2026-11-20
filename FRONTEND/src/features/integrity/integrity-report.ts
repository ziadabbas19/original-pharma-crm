import { trackingReportIntegrityEvent } from '@/api/generated/endpoints'
import { platform } from '@/lib/platform'
import { currentDeviceSignals } from './device-signals-sync'
import type { MockWatchState } from './mock-watch'

/** Tells the server the app saw a fake location (it raises or extends the rep's flag for review). */
export async function reportMockLocation(state: MockWatchState): Promise<void> {
  const { deviceId } = await platform().app.info()
  await trackingReportIntegrityEvent({
    deviceId,
    detectedAt: state.since ?? new Date().toISOString(),
    deviceSignals: currentDeviceSignals(),
  })
}
