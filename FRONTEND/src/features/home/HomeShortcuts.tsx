import { Link, useNavigate } from '@tanstack/react-router'
import { CheckIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { NoteSheet } from '@/features/notes/NoteSheet'
import { homeReminders } from '@/features/notes/note-time'
import { useNotes } from '@/features/notes/use-notes'
import { useNow } from '@/features/notes/use-now'
import { useUnreadNotifications } from '@/features/notifications/use-notifications'
import { useActiveVisit } from '@/features/visits/active-visit'
import { CheckInSheet } from '@/features/visits/CheckInSheet'
import { useRepCustomers, type VisitCustomer } from '@/features/visits/use-rep-customers'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import {
  addShortcut,
  availableShortcuts,
  MAX_SHORTCUTS,
  removeShortcut,
  type ShortcutDef,
  type ShortcutKey,
} from './shortcuts'
import { SortableList } from './SortableList'
import type { TodayPlan } from './today-plan'
import { useHomeShortcuts } from './use-home-shortcuts'

/**
 * The user's shortcuts at the top of Home, four per row. "Edit" turns the grid into a list to remove
 * (x) and reorder (drag the handle) shortcuts, with "Add" (the catalog with checkmarks) and "Reset to
 * default". Saved on the server, shown from the device copy at once and offline.
 */
export function HomeShortcuts({ plan }: { plan: TodayPlan }) {
  const { t } = useTranslation()
  const { tiles, defaults, isDefault, loading, save } = useHomeShortcuts()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const keys = tiles.map((tile) => tile.key)
  const run = useShortcutActions(plan)

  return (
    <Card
      className="gap-3 px-3 py-3 shadow-md"
      role="region"
      aria-labelledby="home-shortcuts-title"
      data-testid="home-shortcuts"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-shortcuts-title" className="ps-2 text-section font-bold">
          {t('shortcuts.title')}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          data-testid="shortcuts-edit"
        >
          {editing ? <CheckIcon /> : <PencilIcon />}
          {editing ? t('common.done') : t('shortcuts.edit')}
        </Button>
      </div>

      {editing ? (
        <div className="grid gap-3" data-testid="shortcuts-editor">
          {tiles.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t('shortcuts.empty')}</p>
          ) : (
            <SortableList
              items={tiles}
              idOf={(tile) => tile.key}
              labelOf={(tile) => t(tile.label)}
              onReorder={(ids) => save(ids as ShortcutKey[])}
              className="grid gap-1.5"
              testId="shortcuts-order"
              renderItem={(tile, handle) => (
                <div className="flex items-center gap-1 rounded-control border bg-background pe-1">
                  {handle}
                  <tile.icon className="size-5 shrink-0 text-primary" aria-hidden />
                  <span
                    className="min-w-0 flex-1 truncate ps-2 text-sm font-medium"
                    data-testid="shortcut-row"
                  >
                    {t(tile.label)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 text-muted-foreground"
                    aria-label={t('shortcuts.remove', { name: t(tile.label) })}
                    onClick={() => save(removeShortcut(keys, tile.key))}
                    data-testid={`shortcut-remove-${tile.key}`}
                  >
                    <XIcon />
                  </Button>
                </div>
              )}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setAdding(true)} data-testid="shortcuts-add">
              <PlusIcon />
              {t('shortcuts.add')}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              disabled={isDefault}
              onClick={() => save(defaults)}
              data-testid="shortcuts-reset"
            >
              <RotateCcwIcon />
              {t('shortcuts.reset')}
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-4 gap-1" aria-busy="true" data-testid="shortcuts-loading">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[5.25rem] rounded-control" />
          ))}
        </div>
      ) : tiles.length === 0 ? (
        <p className="px-2 pb-1 text-sm text-muted-foreground">{t('shortcuts.empty')}</p>
      ) : (
        <ul className="grid grid-cols-4 gap-1" data-testid="shortcuts-grid">
          {tiles.map((tile) => (
            <li key={tile.key} className="min-w-0">
              <ShortcutTile tile={tile} onAction={run.start} />
            </li>
          ))}
        </ul>
      )}

      <AddShortcutsSheet open={adding} onOpenChange={setAdding} keys={keys} onChange={save} />
      {run.sheet}
    </Card>
  )
}

const TILE =
  'relative flex h-full min-h-[5.25rem] w-full flex-col items-center justify-start gap-1.5 rounded-control px-0.5 py-2 text-center transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]'

function ShortcutTile({ tile, onAction }: { tile: ShortcutDef; onAction: (tile: ShortcutDef) => void }) {
  const { t } = useTranslation()
  const badge = useShortcutBadge(tile.badge)
  const body = (
    <>
      <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <tile.icon className="size-[22px]" aria-hidden />
      </span>
      <span className="line-clamp-2 text-xs leading-tight font-medium">{t(tile.label)}</span>
      {badge > 0 && (
        <span
          className="absolute end-1 top-1 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] leading-5 font-semibold text-destructive-foreground tabular-nums"
          data-testid="shortcut-badge"
        >
          {formatNumber(badge)}
          <span className="sr-only"> {t('shortcuts.badge', { count: badge })}</span>
        </span>
      )}
    </>
  )
  const target = tile.target
  if (target.kind === 'route') {
    return (
      <Link
        to={target.to}
        search={target.search as never}
        className={TILE}
        data-testid={`shortcut-${tile.key}`}
      >
        {body}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onAction(tile)}
      className={TILE}
      data-testid={`shortcut-${tile.key}`}
    >
      {body}
    </button>
  )
}

/** Unread notifications, or reminders that are due or overdue. */
function useShortcutBadge(badge: ShortcutDef['badge']): number {
  const unread = useUnreadNotifications()
  const { notes } = useNotes()
  const now = useNow()
  if (badge === 'unreadNotifications') return unread
  if (badge === 'dueReminders') return homeReminders(notes, now).late.length
  return 0
}

/**
 * The shortcuts that act on Home itself. "Start visit" goes through the usual check-in (the running visit
 * if there is one, else the next customer of today's plan, else the customer list); "Today's plan" scrolls
 * to the upcoming visits; "New note" opens the note sheet.
 */
function useShortcutActions(plan: TodayPlan) {
  const navigate = useNavigate()
  const { visit } = useActiveVisit()
  const { customers } = useRepCustomers()
  const shift = useAppSelector((s) => s.tracking.shift)
  const [starting, setStarting] = useState<VisitCustomer | null>(null)
  const [writing, setWriting] = useState(false)

  const start = (tile: ShortcutDef) => {
    if (tile.target.kind !== 'action') return
    switch (tile.target.action) {
      case 'startVisit': {
        if (visit) return void navigate({ to: '/rep/visits/active' })
        const next = shift && plan.next ? customers.find((c) => c.id === plan.next?.id) : undefined
        if (next) return setStarting(next)
        return void navigate({ to: '/rep/doctors' })
      }
      case 'todayPlan': {
        const list = document.querySelector('[data-testid=home-upcoming]')
        if (list) return list.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return void navigate({ to: '/rep/visits' })
      }
      case 'newNote':
        return setWriting(true)
    }
  }

  const sheet = (
    <>
      {starting && <CheckInSheet customer={starting} onClose={() => setStarting(null)} />}
      {writing && <NoteSheet note={null} onClose={() => setWriting(false)} />}
    </>
  )
  return { start, sheet }
}

/** The catalog with checkmarks: tap to add (at the end) or remove; at most eight. */
function AddShortcutsSheet({
  open,
  onOpenChange,
  keys,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  keys: ShortcutKey[]
  onChange: (keys: ShortcutKey[]) => void
}) {
  const { t } = useTranslation()
  const granted = useAppSelector((s) => s.permissions.byKey)
  const full = keys.length >= MAX_SHORTCUTS
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-y-auto"
        data-testid="shortcuts-catalog"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{t('shortcuts.addTitle')}</SheetTitle>
          <SheetDescription>
            {full
              ? t('shortcuts.full', { value: formatNumber(MAX_SHORTCUTS) })
              : t('shortcuts.addHint', { value: formatNumber(MAX_SHORTCUTS) })}
          </SheetDescription>
        </SheetHeader>
        <ul className="grid gap-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {availableShortcuts(granted).map((def) => {
            const chosen = keys.includes(def.key)
            return (
              <li key={def.key}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  disabled={!chosen && full}
                  onClick={() =>
                    onChange(chosen ? removeShortcut(keys, def.key) : addShortcut(keys, def.key))
                  }
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-start text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                    chosen && 'bg-primary-soft text-primary-soft-foreground',
                  )}
                  data-testid={`catalog-${def.key}`}
                >
                  <def.icon className="size-5 shrink-0" aria-hidden />
                  <span className="flex-1">{t(def.label)}</span>
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full border',
                      chosen && 'border-primary bg-primary text-primary-foreground',
                    )}
                    aria-hidden
                  >
                    {chosen && <CheckIcon className="size-4" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
