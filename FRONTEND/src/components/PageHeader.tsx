import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-title">{title}</h1>
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground md:text-[15px]">{description}</p>
        )}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
