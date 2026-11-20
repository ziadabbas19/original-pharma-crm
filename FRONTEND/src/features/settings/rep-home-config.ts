import type { RepHomeSectionDto } from '../../api/generated/model'

/**
 * The rep Home layout (Settings > Rep home): which blocks show, in which order. Same rules as
 * RepHomeSettingsService in the API. No React here, so the unit tests load this file directly.
 */

export const SECTION_KEYS = [
  'todayProgress',
  'upcomingVisits',
  'startNextVisit',
  'weeklySummary',
  'targetsAndSales',
  'managerAlerts',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

export interface RepHomeConfig {
  sections: { key: SectionKey; enabled: boolean }[]
  dailyVisitTarget: number
}

/** Used when the server cannot be reached and nothing was saved on this device yet. */
export const DEFAULT_REP_HOME: RepHomeConfig = {
  sections: [
    { key: 'todayProgress', enabled: true },
    { key: 'upcomingVisits', enabled: true },
    { key: 'startNextVisit', enabled: true },
    { key: 'weeklySummary', enabled: false },
    { key: 'targetsAndSales', enabled: false },
    { key: 'managerAlerts', enabled: true },
  ],
  dailyVisitTarget: 8,
}

const isSectionKey = (key: string): key is SectionKey => (SECTION_KEYS as readonly string[]).includes(key)

/**
 * A layout that is always safe to render: unknown blocks (from a newer server) are dropped, each block
 * appears once, blocks the server did not send are appended with their default state, and a bad target
 * falls back to the default. `undefined` (no answer, offline) gives the defaults.
 */
export function normalizeRepHome(
  value:
    { sections?: readonly RepHomeSectionDto[] | null; dailyVisitTarget?: number | null } | null | undefined,
): RepHomeConfig {
  if (!value?.sections) return DEFAULT_REP_HOME
  const sections: RepHomeConfig['sections'] = []
  for (const section of value.sections) {
    if (isSectionKey(section.key) && !sections.some((s) => s.key === section.key)) {
      sections.push({ key: section.key, enabled: Boolean(section.enabled) })
    }
  }
  for (const fallback of DEFAULT_REP_HOME.sections) {
    if (!sections.some((s) => s.key === fallback.key)) sections.push({ ...fallback })
  }
  const target = value.dailyVisitTarget
  return {
    sections,
    dailyVisitTarget:
      typeof target === 'number' && Number.isInteger(target) && target >= 1 && target <= 50
        ? target
        : DEFAULT_REP_HOME.dailyVisitTarget,
  }
}

/** The blocks the rep Home renders, in the saved order. */
export function enabledSections(config: RepHomeConfig): SectionKey[] {
  return config.sections.filter((s) => s.enabled).map((s) => s.key)
}

/** Moves one block up (-1) or down (+1); unchanged at the ends. */
export function moveSection(config: RepHomeConfig, index: number, direction: -1 | 1): RepHomeConfig {
  const target = index + direction
  if (index < 0 || index >= config.sections.length || target < 0 || target >= config.sections.length) {
    return config
  }
  const sections = [...config.sections]
  ;[sections[index], sections[target]] = [sections[target], sections[index]]
  return { ...config, sections }
}

export function toggleSection(config: RepHomeConfig, key: SectionKey, enabled: boolean): RepHomeConfig {
  return { ...config, sections: config.sections.map((s) => (s.key === key ? { ...s, enabled } : s)) }
}

export function sameLayout(a: RepHomeConfig, b: RepHomeConfig): boolean {
  return (
    a.dailyVisitTarget === b.dailyVisitTarget &&
    a.sections.length === b.sections.length &&
    a.sections.every((s, i) => s.key === b.sections[i].key && s.enabled === b.sections[i].enabled)
  )
}

/** Share of the daily target done, 0 to 1 (a ring is never more than full). */
export function progressShare(done: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(1, Math.max(0, done / target))
}
