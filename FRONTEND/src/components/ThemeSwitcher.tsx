import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: ThemePreference; icon: LucideIcon }[] = [
  { value: 'light', icon: SunIcon },
  { value: 'dark', icon: MoonIcon },
  { value: 'system', icon: MonitorIcon },
]

/** Light / Dark / System segmented switch. `compact` shows icons only (top bar). */
export function ThemeSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation()
  const { preference, setPreference } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className={cn('inline-flex shrink-0 items-center rounded-md border bg-muted/50 p-0.5', className)}
    >
      {OPTIONS.map(({ value, icon: Icon }) => {
        const selected = preference === value
        const label = t(`theme.${value}`)
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
              compact ? 'size-7 justify-center' : 'h-8 px-3',
              selected && 'bg-background text-foreground shadow-xs',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {!compact && <span>{label}</span>}
          </button>
        )
      })}
    </div>
  )
}
