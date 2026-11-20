import { useTranslation } from 'react-i18next'

/** Translated label of a reason code (plausibility checks, device signals, visit reasons). */
export function useReasonLabel(): (code: string) => string {
  const { t } = useTranslation()
  return (code) => t([`flags.signals.${code}`, `visits.reviewReasons.${code}`], { defaultValue: code })
}
