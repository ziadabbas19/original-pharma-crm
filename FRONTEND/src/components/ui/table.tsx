import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * For tables that stay tables on phones (too many numeric columns for cards): the first column
 * stays in view while the rest scrolls sideways inside the table's own box.
 */
export const STICKY_FIRST_COLUMN =
  '[&_tr>*:first-child]:sticky [&_tr>*:first-child]:inset-s-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-card'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="@container relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-border', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors hover:bg-accent/60 data-[state=selected]:bg-primary-soft/60',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-start align-middle text-label font-semibold whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td data-slot="table-cell" className={cn('p-2 align-middle whitespace-nowrap', className)} {...props} />
  )
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow }
