import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { CheckStatus } from '@/store/slices/trackingSlice'
import { StatusIcon } from './StatusIcon'

interface StepCardProps {
  title: string
  why: string
  instructions?: string
  status: CheckStatus
  children?: ReactNode
  actions?: ReactNode
}

/** Common layout of every setup step: title, why, what to do, status, actions. */
export function StepCard({ title, why, instructions, status, children, actions }: StepCardProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-lg leading-snug">{title}</CardTitle>
          <StatusIcon status={status} withLabel />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-accent/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('onboarding.why')}</p>
          <p className="mt-1 text-sm leading-relaxed">{why}</p>
        </div>
        {instructions && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('onboarding.howTo')}</p>
            <p className="mt-1 leading-relaxed">{instructions}</p>
          </div>
        )}
        {status === 'notApplicable' && (
          <p className="text-sm text-muted-foreground">{t('onboarding.notNeededHere')}</p>
        )}
        {children}
      </CardContent>
      {actions && <CardFooter className="flex-col items-stretch gap-2">{actions}</CardFooter>}
    </Card>
  )
}
