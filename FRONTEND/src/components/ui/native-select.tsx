import { ChevronDownIcon } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Styled native <select>. Used for filters and the permission matrix: light,
 * keyboard friendly, and it gets the platform picker on phones.
 * `className` sizes the wrapper; `selectClassName` styles the element itself.
 */
function NativeSelect({
  className,
  selectClassName,
  size = 'default',
  children,
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & {
  selectClassName?: string
  size?: 'sm' | 'default'
}) {
  return (
    <div data-slot="native-select-wrapper" className={cn('relative min-w-0', className)}>
      <select
        data-slot="native-select"
        className={cn(
          'w-full min-w-0 appearance-none rounded-control border border-input bg-card ps-3 pe-8 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
          size === 'sm' ? 'h-8 rounded-[10px] text-xs' : 'h-9',
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute inset-e-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}

export { NativeSelect }
