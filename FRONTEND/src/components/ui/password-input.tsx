import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A password field: the Input with a show / hide button at the inline end (right in English, left in
 * Arabic). The sides follow the language, not the field, because passwords are typed left to right
 * even in Arabic. The password starts hidden and is hidden again whenever the field is shown afresh
 * (another screen, signing out). Spell checking and autocorrect stay off so a shown password is not
 * sent to a spelling service or learnt by the phone's keyboard.
 */
function PasswordInput({ className, id, disabled, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className="relative">
      <Input
        id={inputId}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cn(rtl ? 'pl-11' : 'pr-11', '[&::-ms-reveal]:hidden', className)}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? t('password.hide') : t('password.show')}
        aria-controls={inputId}
        disabled={disabled}
        // Tapping the eye leaves the caret (and the keyboard) in the field.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className={cn(
          'absolute inset-y-0 my-auto inline-flex size-11 items-center justify-center rounded-control text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
          rtl ? 'left-0' : 'right-0',
        )}
        data-testid="password-toggle"
      >
        {visible ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

export { PasswordInput }
