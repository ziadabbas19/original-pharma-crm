import { Loader2Icon } from 'lucide-react'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2Icon className="size-8 animate-spin text-primary" aria-hidden />
    </div>
  )
}
