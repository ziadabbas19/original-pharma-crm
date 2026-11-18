import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { PRESETS, type Preset } from './stats-filters'

/** Date presets, shared with the rep app. */
export function PresetChips({
  value,
  onChange,
  presets = PRESETS,
}: {
  value: Preset
  onChange: (preset: Preset) => void
  presets?: readonly Preset[]
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('stats.period')}>
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={value === preset}
          onClick={() => onChange(preset)}
          className={cn(
            'rounded-full border px-3 py-1 text-sm transition-colors',
            value === preset
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-card hover:bg-accent',
          )}
        >
          {t(`stats.presets.${preset}`)}
        </button>
      ))}
    </div>
  )
}
