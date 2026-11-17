import { Loader2Icon } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'

/** Start-up and route loading screen (the app's splash): the emblem with a spinner. */
export function FullPageSpinner() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background"
      role="status"
      aria-live="polite"
    >
      <BrandLogo variant="emblem" className="size-20" />
      <Loader2Icon className="size-6 animate-spin text-primary" aria-hidden />
    </div>
  )
}
