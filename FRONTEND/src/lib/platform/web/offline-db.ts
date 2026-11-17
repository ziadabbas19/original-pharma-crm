import Dexie, { type EntityTable } from 'dexie'
import type { OfflineDb, QueuedItem } from '../types'

interface OutboxRow {
  id: number
  kind: string
  payload: unknown
  createdAt: string
}

class OutboxDatabase extends Dexie {
  outbox!: EntityTable<OutboxRow, 'id'>

  constructor() {
    super('original-pharma')
    this.version(1).stores({ outbox: '++id, kind, createdAt' })
  }
}

/** IndexedDB outbox (Dexie). Used by the PWA for location points and future offline writes. */
export class DexieOfflineDb implements OfflineDb {
  private readonly db = new OutboxDatabase()

  async enqueue(kind: string, payload: unknown): Promise<void> {
    await this.db.outbox.add({ kind, payload, createdAt: new Date().toISOString() } as OutboxRow)
  }

  async peek<T = unknown>(kind: string, limit: number): Promise<QueuedItem<T>[]> {
    const rows = await this.db.outbox.where('kind').equals(kind).limit(limit).sortBy('id')
    return rows as QueuedItem<T>[]
  }

  async remove(ids: number[]): Promise<void> {
    await this.db.outbox.bulkDelete(ids)
  }

  async count(kind?: string): Promise<number> {
    return kind ? this.db.outbox.where('kind').equals(kind).count() : this.db.outbox.count()
  }
}
