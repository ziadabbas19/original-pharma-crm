import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Title of a group or section (sidebar groups, the More menu, the parts of the roles page), in the shared
 * `section-heading` style. Use `as` to keep the document outline right.
 */
export function SectionHeading({
  as: Tag = 'h2',
  id,
  className,
  children,
}: {
  as?: 'h2' | 'h3' | 'p' | 'span'
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Tag id={id} className={cn('section-heading', className)}>
      {children}
    </Tag>
  )
}
