import { SearchIcon, XIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <SearchIcon
        className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('table.search')}
        aria-label={placeholder ?? t('table.search')}
        className="h-9 ps-9 pe-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-e-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={t('table.clearSearch')}
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Small label above a filter control. `children` receives the id to put on the control. */
export function FilterField({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={cn('grid gap-1', className)}>
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children(id)}
    </div>
  )
}

/** Pushes the following toolbar items to the end of the row. */
export function ToolbarSpacer() {
  return <div className="hidden flex-1 sm:block" />
}
