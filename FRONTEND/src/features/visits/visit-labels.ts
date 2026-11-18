import type { VisitFeedbackCategory, VisitStatus } from '@/api/generated/model'

export const FEEDBACK_CATEGORIES: NonNullable<VisitFeedbackCategory>[] = [
  'positive',
  'needsFollowUp',
  'complaint',
  'request',
]

export const CATEGORY_BADGE: Record<
  NonNullable<VisitFeedbackCategory>,
  'success' | 'warning' | 'destructive' | 'secondary'
> = {
  positive: 'success',
  needsFollowUp: 'warning',
  complaint: 'destructive',
  request: 'secondary',
}

export const STATUS_BADGE: Record<VisitStatus, 'warning' | 'success' | 'outline'> = {
  inProgress: 'warning',
  completed: 'success',
  cancelled: 'outline',
}
