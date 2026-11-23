import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { moveId } from './reorder'

/**
 * A list the rep reorders by dragging the handle of a row (touch, mouse or keyboard: Space to pick up,
 * arrows to move, Space to drop). Only the handle starts a drag, so the rest of the row scrolls and taps
 * as usual.
 */
export function SortableList<T>({
  items,
  idOf,
  labelOf,
  onReorder,
  renderItem,
  className,
  testId,
}: {
  items: readonly T[]
  idOf: (item: T) => string
  /** Spoken name of an item for screen readers. */
  labelOf: (item: T) => string
  onReorder: (ids: string[]) => void
  renderItem: (item: T, handle: ReactNode, index: number) => ReactNode
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const ids = useMemo(() => items.map(idOf), [items, idOf])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const name = (id: UniqueIdentifier) => {
    const item = items[ids.indexOf(String(id))]
    return item === undefined ? '' : labelOf(item)
  }
  const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('reorder.picked', { name: name(active.id), position: position(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t('reorder.over', { name: name(active.id), position: position(over.id) }) : t('reorder.outside'),
    onDragEnd: ({ active, over }) =>
      over
        ? t('reorder.dropped', { name: name(active.id), position: position(over.id) })
        : t('reorder.cancelled'),
    onDragCancel: () => t('reorder.cancelled'),
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('reorder.instructions') } }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onReorder(moveId(ids, String(active.id), String(over.id)))
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className} data-testid={testId}>
          {items.map((item, index) => (
            <SortableRow key={ids[index]} id={ids[index]} label={labelOf(item)}>
              {(handle) => renderItem(item, handle, index)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: (handle: ReactNode) => ReactNode
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
    })
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={t('reorder.handle', { name: label })}
      className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-control text-icon hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden active:cursor-grabbing"
      data-testid="drag-handle"
    >
      <GripVerticalIcon className="size-5" aria-hidden />
    </button>
  )
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('list-none', isDragging && 'relative z-10 opacity-90 shadow-lg')}
      data-id={id}
    >
      {children(handle)}
    </li>
  )
}
