import emblemDark from '@/assets/brand/emblem-dark.svg'
import emblem from '@/assets/brand/emblem.svg'
import logoDark from '@/assets/brand/logo-dark.svg'
import logo from '@/assets/brand/logo.svg'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const SOURCES = {
  full: { light: logo, dark: logoDark },
  emblem: { light: emblem, dark: emblemDark },
} as const

/**
 * Company logo that follows the active theme: the full lockup, or the emblem alone. Size it
 * with a height class (the width follows the artwork's aspect ratio).
 */
export function BrandLogo({
  variant = 'full',
  className,
  decorative = false,
}: {
  variant?: 'full' | 'emblem'
  className?: string
  /** Hide from screen readers when the app name is written next to it. */
  decorative?: boolean
}) {
  const { theme } = useTheme()
  return (
    <img
      src={SOURCES[variant][theme]}
      alt={decorative ? '' : 'Original Pharma'}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn('w-auto shrink-0 select-none', variant === 'full' ? 'h-10' : 'size-8', className)}
    />
  )
}
