import { createFileRoute } from '@tanstack/react-router'
import { NotesPage } from '@/features/notes/NotesPage'

interface NotesSearch {
  /** A note to open (from a reminder). */
  note?: string
}

export const Route = createFileRoute('/admin/notes')({
  validateSearch: (search: Record<string, unknown>): NotesSearch => ({
    note: typeof search.note === 'string' && search.note ? search.note : undefined,
  }),
  component: function NotesRoute() {
    const { note } = Route.useSearch()
    return <NotesPage shell="admin" openNoteId={note} />
  },
})
