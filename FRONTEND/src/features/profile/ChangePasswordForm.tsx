import { CheckCircle2Icon, CheckIcon, DotIcon, EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountChangePassword } from '@/api/generated/endpoints'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleError, inlineErrors } from '@/lib/errors'
import { loadMe } from '@/lib/session'
import { cn } from '@/lib/utils'
import { passwordProblems } from './password-rules'

/** Change your own password. Other sessions are signed out by the server. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation()
  const change = useAccountChangePassword(inlineErrors)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)

  const problems = passwordProblems(next)
  const mismatch = confirm !== '' && confirm !== next
  const valid = current !== '' && problems.length === 0 && confirm === next

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!valid) return
    try {
      await change.mutateAsync({ data: { currentPassword: current, newPassword: next } })
      await loadMe()
      setCurrent('')
      setNext('')
      setConfirm('')
      setTouched(false)
      setDone(true)
      onDone?.()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'account.changePassword' }))
    }
  }

  const type = show ? 'text' : 'password'
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
      <div className="grid gap-2">
        <Label htmlFor="current-password">{t('password.current')}</Label>
        <Input
          id="current-password"
          type={type}
          dir="ltr"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={touched && current === ''}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="new-password">{t('password.new')}</Label>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShow((v) => !v)}
          >
            {show ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            {show ? t('password.hide') : t('password.show')}
          </button>
        </div>
        <Input
          id="new-password"
          type={type}
          dir="ltr"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value)
            setDone(false)
          }}
          aria-invalid={touched && problems.length > 0}
          aria-describedby="password-rules"
        />
        <ul id="password-rules" className="grid gap-0.5 text-xs">
          {(['length', 'upper', 'lower', 'digit'] as const).map((rule) => {
            const ok = next !== '' && !problems.includes(rule)
            return (
              <li
                key={rule}
                className={cn(
                  'flex items-center gap-1.5',
                  ok ? 'text-success' : touched ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {ok ? (
                  <CheckIcon className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <DotIcon className="size-3.5 shrink-0" aria-hidden />
                )}
                {t(`password.rules.${rule}`)}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">{t('password.confirm')}</Label>
        <Input
          id="confirm-password"
          type={type}
          dir="ltr"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || (touched && confirm !== next)}
        />
        {(mismatch || (touched && confirm !== next)) && (
          <p className="text-sm text-destructive">{t('password.mismatch')}</p>
        )}
      </div>
      <FormError error={error} />
      {done && (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertDescription>{t('password.changed')}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={change.isPending}>
        {change.isPending && <Loader2Icon className="animate-spin" />}
        {t('password.submit')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('password.otherSessionsHint')}</p>
    </form>
  )
}
