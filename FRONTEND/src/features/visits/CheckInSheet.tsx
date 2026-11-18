import { Link, useNavigate } from '@tanstack/react-router'
import {
  CameraIcon,
  CloudOffIcon,
  Loader2Icon,
  LocateFixedIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FormError } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { localizedName } from '@/lib/format'
import { platform, type GeoFix } from '@/lib/platform'
import { useAppSelector } from '@/store'
import { startVisit, useActiveVisit } from './active-visit'
import { ProximityResultCard } from './ProximityResultCard'
import type { VisitCustomer } from './use-rep-customers'
import { useVisitRulesData } from './use-visit-rules'
import { captureVisitFix } from './visit-checkin'
import { compressPhoto } from './visit-photo'
import {
  canStartVisit,
  evaluateProximity,
  locationFailureOf,
  willNeedReview,
  type LocationFailure,
} from './visit-proximity'

type Reading = { fix: GeoFix; failure?: undefined } | { fix?: undefined; failure: LocationFailure }

const readLocation = (): Promise<Reading> =>
  captureVisitFix().then(
    (fix) => ({ fix }),
    (error: unknown) => ({ failure: locationFailureOf(error) }),
  )

/** Check-in: a fresh location, the verification result, an optional photo, then the visit starts. */
export function CheckInSheet({ customer, onClose }: { customer: VisitCustomer; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rules = useVisitRulesData()
  const shift = useAppSelector((s) => s.tracking.shift)
  const { visit: active, loaded } = useActiveVisit()
  const hasLocation = customer.lat != null && customer.lng != null
  const [reading, setReading] = useState<Reading | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const online = typeof navigator === 'undefined' || navigator.onLine !== false

  const [locating, setLocating] = useState(hasLocation)

  useEffect(() => {
    if (!hasLocation) return
    let active = true
    void readLocation().then((value) => {
      if (!active) return
      setReading(value)
      setLocating(false)
    })
    return () => {
      active = false
    }
  }, [hasLocation])

  const locate = async () => {
    setLocating(true)
    setReading(null)
    setReading(await readLocation())
    setLocating(false)
  }

  const result =
    hasLocation && !reading
      ? null
      : evaluateProximity(customer, reading?.fix ?? null, rules, reading?.failure ?? 'unavailable')

  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setError(null)
    try {
      setPhoto((await compressPhoto(file)).dataUrl)
    } catch (err) {
      setError(err)
    } finally {
      setPhotoBusy(false)
    }
  }

  const start = async () => {
    if (!reading?.fix || !result || (result.state !== 'inside' && result.state !== 'outside')) return
    setBusy(true)
    setError(null)
    try {
      await startVisit({
        customer: { id: customer.id, name: customer.name, nameAr: customer.nameAr, type: customer.type },
        fix: reading.fix,
        distance: result.distance,
        inside: result.state === 'inside',
        photo,
      })
      onClose()
      await navigate({ to: '/rep/visits/active' })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const blockedByVisit = loaded && active !== null
  const blockedByDay = !shift
  const ready = result !== null && canStartVisit(result) && !blockedByVisit && !blockedByDay

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('visits.checkInFlow.title')}</SheetTitle>
          <SheetDescription>{localizedName(customer.name, customer.nameAr)}</SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 p-4">
          {blockedByVisit && active && (
            <Alert variant="warning" data-testid="check-in-blocked">
              <ShieldAlertIcon />
              <AlertTitle>{t('visits.checkInFlow.alreadyOpenTitle')}</AlertTitle>
              <AlertDescription>
                <p>
                  {t('visits.checkInFlow.alreadyOpenBody', {
                    customer: localizedName(active.customer.name, active.customer.nameAr),
                  })}
                </p>
                <Button asChild size="lg" className="mt-2" onClick={onClose}>
                  <Link to="/rep/visits/active">{t('visits.checkInFlow.openActive')}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {blockedByDay && (
            <Alert variant="warning" data-testid="check-in-no-day">
              <ShieldAlertIcon />
              <AlertTitle>{t('visits.checkInFlow.noDayTitle')}</AlertTitle>
              <AlertDescription>
                <p>{t('visits.checkInFlow.noDayBody')}</p>
                <Button asChild size="lg" className="mt-2" onClick={onClose}>
                  <Link to="/rep">{t('rep.startDay')}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {locating && (
            <div
              className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              role="status"
              aria-live="polite"
              data-testid="proximity-locating"
            >
              <LocateFixedIcon className="size-5 animate-pulse text-primary" aria-hidden />
              {t('visits.checkInFlow.locating')}
            </div>
          )}

          {result && <ProximityResultCard result={result} />}

          {result && willNeedReview(result) && result.state !== 'outside' && (
            <Alert variant="warning" data-testid="proximity-mock">
              <ShieldAlertIcon />
              <AlertDescription>{t('visits.checkInFlow.mockBody')}</AlertDescription>
            </Alert>
          )}

          {!locating && hasLocation && result && !canStartVisit(result) && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="lg" onClick={() => void locate()} data-testid="proximity-retry">
                <RotateCcwIcon />
                {t('visits.checkInFlow.tryAgain')}
              </Button>
              {result.state === 'locationUnavailable' && result.reason === 'denied' && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void platform().deviceHealth.openAppSettings()}
                >
                  {t('visits.checkInFlow.openSettings')}
                </Button>
              )}
            </div>
          )}

          {result && canStartVisit(result) && (
            <section className="grid gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={t('visits.checkInFlow.addPhoto')}
                data-testid="check-in-photo"
                onChange={(e) => void pickPhoto(e)}
              />
              {photo ? (
                <div className="flex items-center gap-3 rounded-lg border p-2">
                  <img
                    src={photo}
                    alt={t('visits.checkInFlow.photoPreview')}
                    className="size-14 rounded-md object-cover"
                  />
                  <p className="min-w-0 flex-1 text-sm">{t('visits.checkInFlow.photoAdded')}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t('visits.checkInFlow.removePhoto')}
                    onClick={() => setPhoto(null)}
                  >
                    <XIcon />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={photoBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  {photoBusy ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
                  {t('visits.checkInFlow.addPhoto')}
                </Button>
              )}
            </section>
          )}

          {!online && ready && (
            <Alert data-testid="check-in-offline">
              <CloudOffIcon />
              <AlertDescription>{t('visits.checkInFlow.offlineBody')}</AlertDescription>
            </Alert>
          )}

          <FormError error={error} />

          <div className="grid gap-2 pb-safe">
            <Button
              size="lg"
              disabled={!ready || busy || locating}
              onClick={() => void start()}
              data-testid="check-in-start"
            >
              {busy && <Loader2Icon className="animate-spin" />}
              {result?.state === 'outside' ? t('visits.checkInFlow.startAnyway') : t('visits.start')}
            </Button>
            <Button variant="ghost" size="lg" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
