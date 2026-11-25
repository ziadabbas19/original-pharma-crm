import { AlertTriangleIcon, ExternalLinkIcon, ListPlusIcon, Loader2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SimilarCustomerDto } from '@/api/generated/model'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { localizedName } from '@/lib/format'

/** One button per candidate, chosen by the form (add to my list, open, ...); none for limited rows. */
type CandidateAction = (candidate: SimilarCustomerDto & { id: string }) => ReactNode

/**
 * "Similar ones already exist in this area": the candidates with the form's main action on each, and
 * "Add anyway" to save the new one regardless.
 */
export function SimilarCustomersNotice({
  candidates,
  action,
  onAddAnyway,
  adding,
}: {
  candidates: SimilarCustomerDto[]
  action: CandidateAction
  onAddAnyway: () => void
  adding: boolean
}) {
  const { t } = useTranslation()
  if (candidates.length === 0) return null
  return (
    <Alert variant="warning" data-testid="similar-customers">
      <AlertTriangleIcon />
      <AlertTitle>{t('similar.title')}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{t('similar.hint')}</p>
        <ul className="grid gap-2">
          {candidates.map((c, index) => {
            const details = c.limited
              ? [localizedName(c.areaName, c.areaNameAr)]
              : [c.address, c.landmark, localizedName(c.townName, c.townNameAr)]
            return (
              <li
                key={c.id ?? `limited-${index}`}
                className="grid gap-1.5 rounded-control border bg-background p-2 text-foreground"
                data-testid="similar-candidate"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 font-medium break-words" data-testid="similar-candidate-name">
                    {localizedName(c.name, c.nameAr)}
                  </span>
                  {c.same && <Badge variant="warning">{t('similar.same')}</Badge>}
                  {c.isInactive && <Badge variant="secondary">{t('similar.inactive')}</Badge>}
                  {c.inMyList && <Badge variant="secondary">{t('doctors.onMyList')}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{details.filter(Boolean).join(' · ')}</p>
                {c.addedByName && (
                  <p className="text-xs text-muted-foreground">
                    {t('doctors.addedBy', { name: c.addedByName })}
                  </p>
                )}
                {c.limited && <p className="text-xs text-muted-foreground">{t('similar.limited')}</p>}
                {c.id && !c.inMyList && action({ ...c, id: c.id })}
              </li>
            )
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={adding}
          onClick={onAddAnyway}
          data-testid="similar-add-anyway"
        >
          {adding && <Loader2Icon className="animate-spin" />}
          {t('similar.addAnyway')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** "This is the same doctor - add to my list" (or to the chosen rep's list). */
export function SameDoctorButton({
  onClick,
  busy,
  forRep = false,
}: {
  onClick: () => void
  busy: boolean
  forRep?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      size="sm"
      className="h-auto min-h-9 w-full justify-start py-1.5 text-start whitespace-normal"
      disabled={busy}
      onClick={onClick}
      data-testid="similar-same-doctor"
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <ListPlusIcon />}
      {forRep ? t('similar.sameDoctorForRep') : t('similar.sameDoctor')}
    </Button>
  )
}

/** "Open" for a pharmacy or place. */
export function OpenCandidateButton({ onClick, children }: { onClick?: () => void; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="w-fit"
      onClick={onClick}
      asChild={children !== undefined}
      data-testid="similar-open"
    >
      {children ?? (
        <>
          <ExternalLinkIcon />
          {t('similar.open')}
        </>
      )}
    </Button>
  )
}
