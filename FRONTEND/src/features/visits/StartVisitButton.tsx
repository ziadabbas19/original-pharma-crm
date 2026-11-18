import { Link } from '@tanstack/react-router'
import { PlayIcon, TimerIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/features/auth/usePermission'
import { P } from '@/lib/permissions'
import { useActiveVisit } from './active-visit'
import { CheckInSheet } from './CheckInSheet'
import type { VisitCustomer } from './use-rep-customers'

/** "Start visit" for a doctor or pharmacy; opens the running visit instead when it is this customer's. */
export function StartVisitButton({ customer, className }: { customer: VisitCustomer; className?: string }) {
  const { t } = useTranslation()
  const allowed = usePermission(P.visits.create)
  const { visit } = useActiveVisit()
  const [open, setOpen] = useState(false)
  if (!allowed) return null

  if (visit?.customer.id === customer.id) {
    return (
      <Button asChild size="lg" variant="secondary" className={className}>
        <Link to="/rep/visits/active">
          <TimerIcon />
          {t('visits.continue')}
        </Link>
      </Button>
    )
  }

  return (
    <>
      <Button size="lg" className={className} onClick={() => setOpen(true)} data-testid="start-visit">
        <PlayIcon />
        {t('visits.start')}
      </Button>
      {open && <CheckInSheet customer={customer} onClose={() => setOpen(false)} />}
    </>
  )
}
