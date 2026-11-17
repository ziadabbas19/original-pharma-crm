import type { TerritoryDto } from '@/api/generated/model'

export interface TerritoryNode extends TerritoryDto {
  depth: number
  /** Ids from the visible root down to this territory (inclusive). */
  path: string[]
}

/**
 * Depth-first order of the territory tree. Territories whose parent is not in
 * the list (outside the caller's scope) start their own branch.
 */
export function flattenTerritories(territories: TerritoryDto[]): TerritoryNode[] {
  const ids = new Set(territories.map((t) => t.id))
  const children = new Map<string | null, TerritoryDto[]>()
  for (const territory of territories) {
    const parent = territory.parentId && ids.has(territory.parentId) ? territory.parentId : null
    const list = children.get(parent) ?? []
    list.push(territory)
    children.set(parent, list)
  }

  const result: TerritoryNode[] = []
  const visit = (parent: string | null, depth: number, path: string[]) => {
    const list = (children.get(parent) ?? []).toSorted((a, b) => a.name.localeCompare(b.name))
    for (const territory of list) {
      const nodePath = [...path, territory.id]
      result.push({ ...territory, depth, path: nodePath })
      visit(territory.id, depth + 1, nodePath)
    }
  }
  visit(null, 0, [])
  return result
}
