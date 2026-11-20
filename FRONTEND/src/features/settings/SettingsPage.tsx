import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2Icon, Loader2Icon, SaveIcon, ShieldCheckIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getSettingsGetLocationTrustQueryKey,
  useSettingsGetLocationTrust,
  useSettingsUpdateLocationTrust,
} from '@/api/generated/endpoints'
import type { LocationTrustSettingsDto, MockLocationPolicy } from '@/api/generated/model'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, FormError, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { cn } from '@/lib/utils'
import {
  draftOf,
  fieldError,
  FIELD_RULES,
  requestOf,
  type LocationTrustDraft,
  type NumericField,
} from './location-trust-form'

/** Settings stored in the database (settings:manage). */
export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettingsGetLocationTrust()

  return (
    <>
      <PageHeader title={t('adminSettings.title')} description={t('adminSettings.hint')} />
      {settings.isLoading ? (
        <LoadingState rows={8} />
      ) : settings.error || !settings.data ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        // The form keeps its own draft; after a save it already holds the saved values.
        <LocationTrustSection settings={settings.data} />
      )}
    </>
  )
}

const GROUPS: { title: string; fields: NumericField[] }[] = [
  { title: 'adminSettings.locationTrust.movement', fields: ['maxSpeedKmh'] },
  {
    title: 'adminSettings.locationTrust.visits',
    fields: ['maxDistanceFromDoctorMeters', 'accuracyAllowanceMeters', 'lowTrustAccuracyMeters'],
  },
  { title: 'adminSettings.locationTrust.accuracy', fields: ['perfectAccuracyMeters', 'repeatedAccuracyRun'] },
  { title: 'adminSettings.locationTrust.privacy', fields: ['deviceSignalsRetentionDays'] },
]

const POLICIES: MockLocationPolicy[] = ['flagOnly', 'flagAndExclude']

function LocationTrustSection({ settings }: { settings: LocationTrustSettingsDto }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useSettingsUpdateLocationTrust()
  const [draft, setDraft] = useState<LocationTrustDraft>(() => draftOf(settings))
  const [touched, setTouched] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (patch: Partial<LocationTrustDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const request = requestOf(draft)
    if (!request) return
    try {
      const updated = await save.mutateAsync({ data: request })
      queryClient.setQueryData(getSettingsGetLocationTrustQueryKey(), updated)
      // Statistics and visit rules depend on these settings.
      await invalidateApi(queryClient, '/api/stats', '/api/visits/rules', '/api/tracking/integrity')
      setSaved(true)
    } catch {
      // shown by FormError
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-primary" />
          {t('adminSettings.locationTrust.title')}
        </CardTitle>
        <CardDescription>
          {t('adminSettings.locationTrust.description')}{' '}
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
          className="grid gap-6"
          noValidate
          onSubmit={(e) => void submit(e)}
          data-testid="location-trust-form"
        >
          {GROUPS.map((group) => (
            <fieldset key={group.title} className="grid gap-4">
              <legend className="mb-2 text-sm font-semibold">{t(group.title)}</legend>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.fields.map((field) => (
                  <NumberField
                    key={field}
                    field={field}
                    value={draft[field]}
                    showError={touched}
                    onChange={(value) => set({ [field]: value } as Partial<LocationTrustDraft>)}
                  />
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{t('adminSettings.locationTrust.policy')}</legend>
            <div className="grid gap-2 md:grid-cols-2" role="radiogroup">
              {POLICIES.map((policy) => (
                <label
                  key={policy}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors',
                    draft.mockPolicy === policy ? 'border-primary bg-primary/5' : 'hover:bg-accent/40',
                  )}
                >
                  <input
                    type="radio"
                    name="mock-policy"
                    value={policy}
                    checked={draft.mockPolicy === policy}
                    onChange={() => set({ mockPolicy: policy })}
                    className="mt-1 accent-primary"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{t(`adminSettings.locationTrust.policies.${policy}`)}</span>
                    <span className="text-muted-foreground">
                      {t(`adminSettings.locationTrust.policies.${policy}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormError error={save.error} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              {t('adminSettings.save')}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-success" role="status">
                <CheckCircle2Icon className="size-4" />
                {t('adminSettings.saved')}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function NumberField({
  field,
  value,
  showError,
  onChange,
}: {
  field: NumericField
  value: string
  showError: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const rule = FIELD_RULES[field]
  const problem = showError ? fieldError(field, value) : null
  const id = `setting-${field}`
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{t(`adminSettings.locationTrust.fields.${field}`)}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={rule.min}
        max={rule.max}
        step={rule.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problem !== null}
        aria-describedby={`${id}-hint`}
        className="tabular-nums"
      />
      <p id={`${id}-hint`} className={cn('text-xs', problem ? 'text-destructive' : 'text-muted-foreground')}>
        {problem
          ? t(`adminSettings.errors.${problem}`, { min: rule.min, max: rule.max })
          : t(`adminSettings.locationTrust.hints.${field}`)}
      </p>
    </div>
  )
}
