import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  LayoutListIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getRepHomeSettingsGetRepHomeQueryKey,
  useRepHomeSettingsGetRepHome,
  useRepHomeSettingsUpdateRepHome,
} from '@/api/generated/endpoints'
import type { RepHomeSettingsDto } from '@/api/generated/model'
import { ErrorState, FormError, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inlineErrors } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  enabledSections,
  moveSection,
  normalizeRepHome,
  sameLayout,
  toggleSection,
  type RepHomeConfig,
  type SectionKey,
} from './rep-home-config'

/** Settings > Rep home: which blocks the rep app shows on Home, in which order (settings:manage). */
export function RepHomeSettingsSection() {
  const settings = useRepHomeSettingsGetRepHome()
  if (settings.isLoading) return <LoadingState rows={6} />
  if (settings.error || !settings.data) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
  }
  return <RepHomeForm settings={settings.data} />
}

function RepHomeForm({ settings }: { settings: RepHomeSettingsDto }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useRepHomeSettingsUpdateRepHome(inlineErrors)
  const [draft, setDraft] = useState<RepHomeConfig>(() => normalizeRepHome(settings))
  const [target, setTarget] = useState(String(normalizeRepHome(settings).dailyVisitTarget))
  const [saved, setSaved] = useState(false)
  const defaults = normalizeRepHome(settings.defaults)

  const targetValue = Number(target)
  const targetValid = Number.isInteger(targetValue) && targetValue >= 1 && targetValue <= 50
  const current = { ...draft, dailyVisitTarget: targetValid ? targetValue : draft.dailyVisitTarget }

  const change = (next: RepHomeConfig) => {
    setDraft(next)
    setSaved(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!targetValid) return
    try {
      const updated = await save.mutateAsync({
        data: { sections: current.sections, dailyVisitTarget: current.dailyVisitTarget },
      })
      queryClient.setQueryData(getRepHomeSettingsGetRepHomeQueryKey(), updated)
      setSaved(true)
    } catch {
      // shown by FormError
    }
  }

  const reset = () => {
    change(defaults)
    setTarget(String(defaults.dailyVisitTarget))
  }

  return (
    <Card data-testid="rep-home-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutListIcon className="size-5 text-primary" />
          {t('adminSettings.repHome.title')}
        </CardTitle>
        <CardDescription>
          {t('adminSettings.repHome.description')}{' '}
          {settings.isDefault
            ? t('adminSettings.locationTrust.defaults')
            : t('adminSettings.locationTrust.updated', {
                name: settings.updatedByName ?? '—',
                time: formatDateTime(settings.updatedAt),
              })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
          noValidate
          onSubmit={(e) => void submit(e)}
        >
          <div className="grid content-start gap-4">
            <ol className="grid gap-2" aria-label={t('adminSettings.repHome.order')}>
              {draft.sections.map((section, index) => {
                const id = `rep-home-${section.key}`
                return (
                  <li
                    key={section.key}
                    className={cn(
                      'flex items-center gap-3 rounded-control border bg-card p-2.5 ps-3',
                      !section.enabled && 'bg-muted/40',
                    )}
                    data-testid={`rep-home-row-${section.key}`}
                  >
                    <span className="w-5 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <Checkbox
                      id={id}
                      checked={section.enabled}
                      onCheckedChange={(value) => change(toggleSection(draft, section.key, value === true))}
                    />
                    <Label htmlFor={id} className="grid flex-1 gap-0.5 font-normal">
                      <span className="font-semibold">{t(`repHome.sections.${section.key}`)}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(`adminSettings.repHome.hints.${section.key}`)}
                      </span>
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-9"
                        disabled={index === 0}
                        aria-label={t('adminSettings.repHome.moveUp', {
                          name: t(`repHome.sections.${section.key}`),
                        })}
                        onClick={() => change(moveSection(draft, index, -1))}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-9"
                        disabled={index === draft.sections.length - 1}
                        aria-label={t('adminSettings.repHome.moveDown', {
                          name: t(`repHome.sections.${section.key}`),
                        })}
                        onClick={() => change(moveSection(draft, index, 1))}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="grid max-w-xs gap-1.5">
              <Label htmlFor="rep-home-target">{t('adminSettings.repHome.target')}</Label>
              <Input
                id="rep-home-target"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value)
                  setSaved(false)
                }}
                aria-invalid={!targetValid}
                className="tabular-nums"
              />
              <p className={cn('text-xs', targetValid ? 'text-muted-foreground' : 'text-destructive')}>
                {targetValid
                  ? t('adminSettings.repHome.targetHint')
                  : t('adminSettings.errors.range', { min: 1, max: 50 })}
              </p>
            </div>

            <FormError error={save.error} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={save.isPending || !targetValid}>
                {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                {t('adminSettings.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={sameLayout(current, defaults)}
                onClick={reset}
              >
                <RotateCcwIcon />
                {t('adminSettings.repHome.reset')}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-success" role="status">
                  <CheckCircle2Icon className="size-4" />
                  {t('adminSettings.saved')}
                </span>
              )}
            </div>
          </div>

          <RepHomePreview sections={enabledSections(current)} target={current.dailyVisitTarget} />
        </form>
      </CardContent>
    </Card>
  )
}

/** A small drawing of the rep Home with the enabled blocks in their order. */
export function RepHomePreview({ sections, target }: { sections: SectionKey[]; target: number }) {
  const { t } = useTranslation()
  return (
    <figure className="grid content-start justify-items-center gap-2" data-testid="rep-home-preview">
      <div
        className="w-full max-w-[16rem] overflow-hidden rounded-[28px] border-[6px] border-navy bg-background shadow-float"
        aria-hidden
      >
        <div className="rounded-b-2xl bg-primary px-3 pt-3 pb-7 text-primary-foreground">
          <div className="h-2 w-16 rounded-full bg-primary-foreground/70" />
          <div className="mt-1.5 h-3 w-28 rounded-full bg-primary-foreground" />
        </div>
        <ol className="-mt-5 grid gap-1.5 px-2.5 pb-3">
          {sections.length === 0 && (
            <li className="rounded-xl border bg-card p-2 text-[10px] text-muted-foreground">
              {t('repHome.noSections')}
            </li>
          )}
          {sections.map((section) => (
            <li
              key={section}
              className={cn(
                'rounded-xl border bg-card p-2 shadow-card',
                section === 'startNextVisit' && 'border-transparent bg-primary text-primary-foreground',
              )}
              data-preview-section={section}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-semibold">
                {section === 'todayProgress' && (
                  <span className="size-5 rounded-full border-[3px] border-green border-s-muted" />
                )}
                {t(`repHome.sections.${section}`)}
                {section === 'todayProgress' && <span className="ms-auto tabular-nums">0 / {target}</span>}
              </span>
              {section === 'upcomingVisits' && (
                <span className="mt-1.5 grid gap-1">
                  <span className="h-2 w-full rounded-full bg-muted" />
                  <span className="h-2 w-4/5 rounded-full bg-muted" />
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="mx-2.5 mb-2.5 grid h-7 grid-cols-4 gap-1 rounded-2xl border bg-card p-1">
          <span className="rounded-xl bg-primary-soft" />
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">{t('adminSettings.repHome.preview')}</figcaption>
    </figure>
  )
}
