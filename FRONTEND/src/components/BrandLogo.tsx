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
  tile = false,
  onDark = false,
}: {
  variant?: 'full' | 'emblem'
  className?: string
  /** Hide from screen readers when the app name is written next to it. */
  decorative?: boolean
  /** On the white logo tile: always the light artwork, whatever the theme. */
  tile?: boolean
  /** On a surface that stays dark in both themes (the navy sidebar): always the artwork for dark backgrounds. */
  onDark?: boolean
}) {
  const { theme } = useTheme()
  return (
    <img
      src={SOURCES[variant][tile ? 'light' : onDark ? 'dark' : theme]}
      alt={decorative ? '' : 'Original Pharma'}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn('w-auto shrink-0 select-none', variant === 'full' ? 'h-10' : 'size-8', className)}
    />
  )
}

/** The logo on a white rounded tile (the emblem in the rep Home header). */
export function BrandTile({
  variant = 'full',
  className,
  logoClassName,
  decorative,
}: {
  variant?: 'full' | 'emblem'
  className?: string
  logoClassName?: string
  decorative?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control bg-tile shadow-card',
        variant === 'full' ? 'px-3 py-1.5' : 'p-1.5',
        className,
      )}
    >
      <BrandLogo variant={variant} tile decorative={decorative} className={logoClassName} />
    </span>
  )
}
