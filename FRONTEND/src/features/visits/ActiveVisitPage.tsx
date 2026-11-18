import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { LogOutIcon, ReceiptTextIcon, ShieldAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { useNow } from '@/hooks/use-now'
import { formatDistance, formatTime, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { saveActiveVisit, useActiveVisit, type ActiveVisit, type VisitDraft } from './active-visit'
import { CheckOutDialog } from './CheckOutDialog'
import { VisitContentFields } from './VisitContentFields'
import { VisitSyncBadge } from './VisitSyncBadge'

const AUTOSAVE_MS = 400

function elapsed(fromIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
}

function ActiveVisitScreen({ visit, onClosing }: { visit: ActiveVisit; onClosing: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canOrder = usePermission(P.orders.create)
  const now = useNow(1000)
  const [draft, setDraft] = useState<VisitDraft>(visit.draft)
  const [checkingOut, setCheckingOut] = useState(false)
  const latest = useRef({ visit, draft })
  const dirty = useRef(false)

  useEffect(() => {
    latest.current = { visit, draft }
  }, [visit, draft])

  // Every change is on the device within a moment, so killing the app loses nothing.
  useEffect(() => {
    if (!dirty.current) return
    const timer = window.setTimeout(() => {
      dirty.current = false
      void saveActiveVisit({ ...latest.current.visit, draft: latest.current.draft })
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(
    () => () => {
      if (dirty.current) void saveActiveVisit({ ...latest.current.visit, draft: latest.current.draft })
    },
    [],
  )

  const change = (next: VisitDraft) => {
    dirty.current = true
    setDraft(next)
  }

  const customer = localizedName(visit.customer.name, visit.customer.nameAr)
  const flagged = !visit.inside || visit.isMock

  return (
    <div className="space-y-4 pb-20">
      <Card className="py-4">
        <CardContent className="grid gap-2 px-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="min-w-0 text-lg font-semibold" data-testid="active-customer">
              {customer}
            </h1>
            <VisitSyncBadge visitId={visit.visitId} />
          </div>
          <p
            className="text-4xl font-semibold tracking-tight tabular-nums rtl:text-right"
            dir="ltr"
            role="timer"
            aria-label={t('visits.active.elapsed')}
            data-testid="active-timer"
          >
            {elapsed(visit.checkInAt, now)}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('visits.active.startedAt', { time: formatTime(visit.checkInAt) })} ·{' '}
            {t('visits.active.accuracy', { accuracy: formatDistance(Math.round(visit.accuracy)) })}
          </p>
        </CardContent>
      </Card>

      {flagged && (
        <Alert variant="warning" data-testid="active-flagged">
          <ShieldAlertIcon />
          <AlertDescription>
            {visit.isMock
              ? t('visits.checkInFlow.mockBody')
              : t('visits.active.outsideNote', { distance: formatDistance(visit.distance) })}
          </AlertDescription>
        </Alert>
      )}

      <Card className="py-4">
        <CardContent className="px-4">
          <VisitContentFields value={draft} onChange={change} />
        </CardContent>
      </Card>

      {canOrder && (
        <Button asChild variant="outline" size="lg" className="w-full" data-testid="active-order">
          <Link
            to="/rep/orders/new"
            search={{
              visitId: visit.visitId,
              customerId: visit.customer.id,
              placeName: customer,
              placeType: visit.customer.type === 'pharmacy' ? 'pharmacy' : 'other',
            }}
          >
            <ReceiptTextIcon />
            {t('visits.active.createOrder')}
          </Link>
        </Button>
      )}

      <div className="sticky bottom-16 z-10 pb-safe">
        <Button
          size="xl"
          variant="destructive"
          className="w-full"
          onClick={() => setCheckingOut(true)}
          data-testid="check-out"
        >
          <LogOutIcon />
          {t('visits.checkOutFlow.action')}
        </Button>
      </div>

      {checkingOut && (
        <CheckOutDialog
          visit={{ ...visit, draft }}
          onClose={() => setCheckingOut(false)}
          onConfirm={onClosing}
          onDone={() => void navigate({ to: '/rep/visits/$visitId', params: { visitId: visit.visitId } })}
        />
      )}
    </div>
  )
}

/** The running visit. Comes back as it was after the app is reopened. */
export function ActiveVisitPage() {
  const { visit, loaded } = useActiveVisit()
  const [closing, setClosing] = useState(false)
  if (!loaded || (!visit && closing)) return <LoadingState rows={6} />
  if (!visit) return <Navigate to="/rep/visits" />
  return <ActiveVisitScreen key={visit.visitId} visit={visit} onClosing={() => setClosing(true)} />
}
