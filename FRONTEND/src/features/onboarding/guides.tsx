import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, MapPinIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { OemBrand } from './health'

/**
 * Screenshot-style walkthrough of Android's app location settings, drawn with
 * plain elements so it follows the app language and needs no image assets.
 */
export function AllowAllTheTimeGuide() {
  const { t, i18n } = useTranslation()
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeftIcon : ChevronRightIcon
  const k = (key: string) => t(`onboarding.steps.locationAlways.${key}`)

  return (
    <figure className="space-y-2">
      <figcaption className="text-xs font-medium text-muted-foreground">{k('guideTitle')}</figcaption>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span>{k('guideAppInfo')}</span>
        <Chevron className="size-3" />
        <span>{k('guidePermissions')}</span>
        <Chevron className="size-3" />
        <span className="font-medium text-foreground">{k('guideLocation')}</span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm" aria-hidden>
        <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-sm font-medium">
          <MapPinIcon className="size-4" />
          {k('guideLocation')}
        </div>
        <div className="divide-y text-sm">
          <Radio label={k('guideAllowAll')} selected />
          <Radio label={k('guideWhileUsing')} />
          <Radio label={k('guideDeny')} />
          <div className="flex items-center justify-between px-3 py-3">
            <span>{k('guidePrecise')}</span>
            <span className="flex h-5 w-9 items-center rounded-full bg-primary p-0.5 ring-2 ring-primary/40">
              <span className="size-4 rounded-full bg-white ltr:ms-auto rtl:me-auto" />
            </span>
          </div>
        </div>
      </div>
    </figure>
  )
}

function Radio({ label, selected = false }: { label: string; selected?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 px-3 py-3', selected && 'bg-primary/10 font-medium')}>
      <span
        className={cn(
          'flex size-5 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-muted-foreground/50',
        )}
      >
        {selected && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      {label}
    </div>
  )
}

/** Manufacturer-specific battery steps (Samsung, Xiaomi, OPPO, Huawei, vivo, generic). */
export function OemBatteryGuide({
  brand,
  onOpenPowerSettings,
}: {
  brand: OemBrand
  onOpenPowerSettings?: () => void
}) {
  const { t } = useTranslation()
  const steps = t(`oem.${brand}.steps`, { returnObjects: true }) as string[]

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">
        {t('onboarding.steps.battery.oemTitle', { brand: t(`oem.${brand}.name`) })}
      </p>
      <ol className="list-decimal space-y-2 ps-5 text-sm leading-relaxed">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {onOpenPowerSettings && (
        <Button variant="outline" size="sm" onClick={onOpenPowerSettings}>
          <ExternalLinkIcon />
          {t('onboarding.steps.battery.oemAction')}
        </Button>
      )}
    </div>
  )
}
