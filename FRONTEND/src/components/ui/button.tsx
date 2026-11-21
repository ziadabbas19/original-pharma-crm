import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-card hover:bg-primary-hover',
        /** The brand green with dark text (check in, confirm on site). */
        success: 'bg-green text-green-foreground shadow-card hover:bg-green/85',
        destructive: 'bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90',
        outline: 'border border-input bg-card shadow-card hover:bg-accent hover:text-accent-foreground',
        /** Outline in the danger colour (sign out, cancel a running action). */
        outlineDestructive:
          'border border-destructive/45 bg-card text-destructive hover:bg-destructive-soft focus-visible:ring-destructive/30',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        /** Soft blue (selected toggles, secondary actions on blue). */
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/75',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Phones: every button is at least 44 px tall (and icon buttons 44 px wide) for touch.
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3 max-sm:h-11',
        sm: 'h-8 gap-1.5 rounded-[10px] px-3 has-[>svg]:px-2.5 max-sm:h-11',
        lg: 'h-12 px-6 text-base has-[>svg]:px-4',
        xl: 'h-14 rounded-[14px] px-8 text-base has-[>svg]:px-6',
        icon: 'size-10 max-sm:size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
