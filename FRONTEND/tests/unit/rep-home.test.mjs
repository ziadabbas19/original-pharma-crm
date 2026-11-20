import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_REP_HOME,
  enabledSections,
  moveSection,
  normalizeRepHome,
  progressShare,
  sameLayout,
  toggleSection,
} from '../../src/features/settings/rep-home-config.ts'
import { todayPlan } from '../../src/features/home/today-plan.ts'

test('without an answer from the server the defaults are shown', () => {
  assert.deepEqual(normalizeRepHome(undefined), DEFAULT_REP_HOME)
  assert.deepEqual(normalizeRepHome(null), DEFAULT_REP_HOME)
  assert.deepEqual(enabledSections(DEFAULT_REP_HOME), [
    'todayProgress',
    'upcomingVisits',
    'startNextVisit',
    'managerAlerts',
  ])
})

test('the saved order is kept and only enabled sections are rendered', () => {
  const config = normalizeRepHome({
    sections: [
      { key: 'managerAlerts', enabled: true },
      { key: 'weeklySummary', enabled: true },
      { key: 'todayProgress', enabled: false },
      { key: 'startNextVisit', enabled: true },
      { key: 'upcomingVisits', enabled: false },
      { key: 'targetsAndSales', enabled: false },
    ],
    dailyVisitTarget: 6,
  })
  assert.deepEqual(enabledSections(config), ['managerAlerts', 'weeklySummary', 'startNextVisit'])
  assert.equal(config.dailyVisitTarget, 6)
})

test('unknown, repeated and missing sections from another version are handled', () => {
  const config = normalizeRepHome({
    sections: [
      { key: 'leaderboard', enabled: true },
      { key: 'startNextVisit', enabled: true },
      { key: 'startNextVisit', enabled: false },
    ],
    dailyVisitTarget: 99,
  })
  assert.equal(config.sections.length, 6)
  assert.equal(config.sections[0].key, 'startNextVisit')
  assert.equal(config.sections[0].enabled, true)
  assert.equal(config.dailyVisitTarget, 8)
})

test('sections move up and down and stop at the ends', () => {
  const down = moveSection(DEFAULT_REP_HOME, 0, 1)
  assert.deepEqual(
    down.sections.slice(0, 2).map((s) => s.key),
    ['upcomingVisits', 'todayProgress'],
  )
  assert.equal(moveSection(DEFAULT_REP_HOME, 0, -1), DEFAULT_REP_HOME)
  assert.equal(moveSection(DEFAULT_REP_HOME, 5, 1), DEFAULT_REP_HOME)
  const off = toggleSection(DEFAULT_REP_HOME, 'managerAlerts', false)
  assert.equal(sameLayout(off, DEFAULT_REP_HOME), false)
  assert.equal(sameLayout(toggleSection(off, 'managerAlerts', true), DEFAULT_REP_HOME), true)
})

test('the progress ring never overflows', () => {
  assert.equal(progressShare(5, 8), 0.625)
  assert.equal(progressShare(12, 8), 1)
  assert.equal(progressShare(3, 0), 0)
})

const doctor = (id, name, town = 'Nasr City') => ({ id, type: 'doctor', name, townName: town })

test('the running visit comes first, then doctors not visited today, then finished visits', () => {
  const plan = todayPlan({
    customers: [
      doctor('a', 'Dr. Adel'),
      doctor('b', 'Dr. Basma'),
      doctor('c', 'Dr. Camilia'),
      { id: 'p', type: 'pharmacy', name: 'Pharmacy' },
    ],
    visits: [
      {
        id: 'v1',
        customerId: 'b',
        customerName: 'Dr. Basma',
        status: 'completed',
        checkInAt: '2026-11-20T08:00:00Z',
      },
      {
        id: 'v2',
        customerId: 'c',
        customerName: 'Dr. Camilia',
        status: 'inProgress',
        checkInAt: '2026-11-20T09:00:00Z',
      },
    ],
  })
  assert.deepEqual(
    plan.items.map((i) => [i.kind, i.customerId]),
    [
      ['inProgress', 'c'],
      ['waiting', 'a'],
      ['done', 'b'],
    ],
  )
  assert.equal(plan.done, 1)
  assert.equal(plan.inProgress, true)
  assert.equal(plan.next, null)
})

test('the next visit is the first doctor not visited today, also before the check-in reaches the server', () => {
  const customers = [doctor('a', 'Dr. Adel'), doctor('b', 'Dr. Basma')]
  assert.equal(todayPlan({ customers, visits: [] }).next.id, 'a')
  const offline = todayPlan({ customers, visits: [], activeCustomerId: 'a' })
  assert.equal(offline.items[0].kind, 'inProgress')
  assert.equal(offline.next, null)
  assert.equal(todayPlan({ customers: [], visits: [] }).items.length, 0)
})
