import { CheckCircle2Icon, LocateOffIcon, MapPinPlusIcon, MapPinXIcon, RadarIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatDistance, formatNumber } from '@/lib/format'
import type { ProximityResult } from './visit-proximity'

const accuracyText = (meters: number) => formatDistance(Math.round(meters))

/** The verification result the rep sees before starting a visit. */
export function ProximityResultCard({ result }: { result: ProximityResult }) {
  const { t } = useTranslation()
  switch (result.state) {
    case 'inside':
      return (
        <Alert variant="success" data-testid="proximity-inside">
          <CheckCircle2Icon />
          <AlertTitle>{t('visits.checkInFlow.insideTitle')}</AlertTitle>
          <AlertDescription>
            {t('visits.checkInFlow.insideBody', {
              distance: formatDistance(result.distance),
              accuracy: accuracyText(result.accuracy),
            })}
          </AlertDescription>
        </Alert>
      )
    case 'outside':
      return (
        <Alert variant={result.refused ? 'destructive' : 'warning'} data-testid="proximity-outside">
          <MapPinXIcon />
          <AlertTitle>
            {t('visits.checkInFlow.outsideTitle', { distance: formatDistance(result.distance) })}
          </AlertTitle>
          <AlertDescription>
            {t(result.refused ? 'visits.checkInFlow.outsideRefused' : 'visits.checkInFlow.outsideBody', {
              allowed: formatDistance(result.allowed),
              accuracy: accuracyText(result.accuracy),
            })}
          </AlertDescription>
        </Alert>
      )
    case 'firstVisit':
      return (
        <Alert variant={result.willSave ? 'info' : 'warning'} data-testid="proximity-first-visit">
          <MapPinPlusIcon />
          <AlertTitle>{t('visits.checkInFlow.firstVisitTitle')}</AlertTitle>
          <AlertDescription>
            {result.willSave
              ? t('visits.checkInFlow.firstVisitBody', { accuracy: accuracyText(result.accuracy) })
              : t(
                  result.isMock
                    ? 'visits.checkInFlow.firstVisitMockBody'
                    : 'visits.checkInFlow.firstVisitWeakBody',
                  { accuracy: accuracyText(result.accuracy) },
                )}
          </AlertDescription>
        </Alert>
      )
    case 'lowAccuracy':
      return (
        <Alert variant="warning" data-testid="proximity-low-accuracy">
          <RadarIcon />
          <AlertTitle>{t('visits.checkInFlow.lowAccuracyTitle')}</AlertTitle>
          <AlertDescription>
            {t('visits.checkInFlow.lowAccuracyBody', {
              accuracy: formatNumber(Math.round(result.accuracy)),
              max: formatNumber(result.maxAccuracy),
            })}
          </AlertDescription>
        </Alert>
      )
    case 'locationUnavailable':
      return (
        <Alert variant="destructive" data-testid="proximity-unavailable">
          <LocateOffIcon />
          <AlertTitle>{t(`visits.checkInFlow.unavailable.${result.reason}.title`)}</AlertTitle>
          <AlertDescription>{t(`visits.checkInFlow.unavailable.${result.reason}.body`)}</AlertDescription>
        </Alert>
      )
  }
}
