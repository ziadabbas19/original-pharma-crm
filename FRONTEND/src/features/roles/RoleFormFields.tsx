import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function TextField({
  id,
  label,
  dir,
  value,
  disabled,
  onBlur,
  onChange,
  errors,
}: {
  id: string
  label: string
  dir: 'rtl' | 'ltr'
  value: string
  disabled?: boolean
  onBlur: () => void
  onChange: (value: string) => void
  errors: unknown[]
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        dir={dir}
        autoComplete="off"
        value={value}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={errors.filter(Boolean).length > 0}
      />
      <Errors messages={errors} />
    </div>
  )
}

export function Errors({ messages }: { messages: unknown[] }) {
  const text = messages.filter(Boolean).map(String)
  if (text.length === 0) return null
  return <p className="text-sm text-destructive">{text.join(' ')}</p>
}
