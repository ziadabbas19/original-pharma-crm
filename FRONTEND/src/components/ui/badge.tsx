import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        /** Soft blue: scheduled, in progress, informative. */
        default: 'border-transparent bg-primary-soft text-primary-soft-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        /** Soft green: done, healthy. */
        success: 'border-transparent bg-success-soft text-success',
        /** Soft amber: late, needs attention. */
        warning: 'border-transparent bg-warning-soft text-warning-soft-foreground',
        destructive: 'border-transparent bg-destructive-soft text-destructive',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
