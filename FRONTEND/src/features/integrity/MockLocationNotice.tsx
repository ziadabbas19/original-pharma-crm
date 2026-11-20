import { Loader2Icon, MapPinOffIcon, RefreshCwIcon, SettingsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { platform } from '@/lib/platform'
import { useAppSelector } from '@/store'
import { secondsUntilCheck } from './mock-watch'

/**
 * Shown across the rep app while a fake (mock) location is on. The message is always in Arabic
 * first and English second, whatever language the app uses, so every rep can read it. It never
 * blocks the app: the rep can keep working while the app checks again on its own.
 */
export function MockLocationNotice({ onCheckNow }: { onCheckNow: () => void }) {
  const active = useAppSelector((s) => s.tracking.mockWatch.active)
  // The countdown below ticks every second, so it is only mounted while the notice is shown.
  return active ? <ActiveNotice onCheckNow={onCheckNow} /> : null
}

function ActiveNotice({ onCheckNow }: { onCheckNow: () => void }) {
  const { t, i18n } = useTranslation()
  const watch = useAppSelector((s) => s.tracking.mockWatch)
  const now = useNow(1_000)

  const ar = i18n.getFixedT('ar')
  const en = i18n.getFixedT('en')
  const seconds = secondsUntilCheck(watch, now)
  const native = platform().kind === 'native'

  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 border-t-0"
      data-testid="mock-location-notice"
    >
      <MapPinOffIcon />
      <AlertTitle className="grid gap-0.5">
        <span lang="ar" dir="rtl">
          {ar('integrity.mock.title')}
        </span>
        <span lang="en" dir="ltr" className="text-xs font-normal opacity-90">
          {en('integrity.mock.title')}
        </span>
      </AlertTitle>
      <AlertDescription className="text-foreground">
        <p lang="ar" dir="rtl">
          {ar('integrity.mock.body')}
        </p>
        <p lang="en" dir="ltr" className="text-xs text-muted-foreground">
          {en('integrity.mock.body')}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {native && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void platform()
                  .deviceHealth.openDeveloperOptions()
                  .catch(() => {})
              }
            >
              <SettingsIcon />
              {t('integrity.mock.openSettings')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onCheckNow} disabled={seconds === 0}>
            {seconds === 0 ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            {seconds === 0 ? t('integrity.mock.checking') : t('integrity.mock.checkNow')}
          </Button>
          {seconds > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('integrity.mock.nextCheck', { seconds })}
            </span>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
