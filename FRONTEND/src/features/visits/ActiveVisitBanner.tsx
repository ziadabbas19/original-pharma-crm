import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { AlarmClockIcon, ChevronRightIcon, TimerIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { formatDateTime, localizedName } from '@/lib/format'
import { platform } from '@/lib/platform'
import { reconcileActiveVisit, useActiveVisit, watchRefusedCheckIns } from './active-visit'
import { CheckOutDialog } from './CheckOutDialog'
import { forgotToCheckOut } from './visit-queue'

/**
 * Keeps the running visit in reach from every rep screen, and asks about a visit that was never closed:
 * check out now, or check out with a note that explains the delay.
 */
export function ActiveVisitBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { visit } = useActiveVisit()
  const now = useNow(60_000)
  const [checkOut, setCheckOut] = useState<'now' | 'explain' | null>(null)

  useEffect(() => watchRefusedCheckIns(), [])

  useEffect(() => {
    const run = () => void reconcileActiveVisit().catch(() => {})
    run()
    window.addEventListener('online', run)
    const stopResume = platform().app.onResume(run)
    return () => {
      window.removeEventListener('online', run)
      stopResume()
    }
  }, [])

  if (!visit) return null
  const customer = localizedName(visit.customer.name, visit.customer.nameAr)
  const forgot = forgotToCheckOut(visit.checkInAt, now)

  return (
    <>
      {forgot ? (
        <div className="grid gap-2 border-b bg-warning/15 p-3" role="alert" data-testid="forgot-banner">
          <p className="flex items-start gap-2 text-sm">
            <AlarmClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('visits.forgot.body', { customer, time: formatDateTime(visit.checkInAt) })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={() => setCheckOut('now')} data-testid="forgot-now">
              {t('visits.forgot.now')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setCheckOut('explain')}
              data-testid="forgot-explain"
            >
              {t('visits.forgot.explain')}
            </Button>
          </div>
        </div>
      ) : (
        pathname !== '/rep/visits/active' && (
          <Link
            to="/rep/visits/active"
            className="flex min-h-11 items-center gap-2 border-b bg-primary/10 px-4 py-2 text-sm font-medium"
            data-testid="active-banner"
          >
            <TimerIcon className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t('visits.active.banner', { customer })}</span>
            <ChevronRightIcon className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          </Link>
        )
      )}
      {checkOut && (
        <CheckOutDialog
          visit={visit}
          explain={checkOut === 'explain'}
          onClose={() => setCheckOut(null)}
          onConfirm={() => navigate({ to: '/rep/visits/$visitId', params: { visitId: visit.visitId } })}
          onDone={() => setCheckOut(null)}
        />
      )}
    </>
  )
}
