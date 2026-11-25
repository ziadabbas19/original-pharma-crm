/**
 * Home shortcuts on a phone (390 x 844) in Arabic, with a fake API (no backend needed): the rep's default
 * shortcuts, editing them (remove, add from the catalog, reorder by keyboard drag), the list kept by the
 * server so a reload shows it again, and the "Recently visited" strip.
 *   UI_TEST_URL=http://localhost:5173 npm run test:ui:shortcuts
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './browser.mjs'
import { mockSession, profile } from './mock-api.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const shotsDir = process.env.UI_SHOTS_DIR

const REP_ID = '00000000-0000-0000-0000-0000000000b1'
const rep = profile({
  id: REP_ID,
  email: 'rep@example.test',
  fullName: 'مندوب الشرق',
  preferredLanguage: 'ar',
  roles: [{ id: 'role-rep', key: 'Rep', nameAr: 'مندوب طبي', nameEn: 'Medical rep', level: 40 }],
})
const REP_GRANTS = [
  'visits:read',
  'visits:create',
  'tracking:report',
  'customers:read',
  'customers:create',
  'orders:create',
  'expenses:read-own',
  'expenses:write-own',
  'plans:read-own',
  'stats:read',
].map((key) => ({ key, scope: 'own' }))

const recent = [
  {
    id: 'd-ahmed',
    type: 'doctor',
    name: 'Dr. Ahmed Fathy',
    nameAr: 'د. أحمد فتحي',
    lat: 30.05,
    lng: 31.33,
    geofenceRadiusMeters: 150,
    phone: '01001234567',
    address: null,
    landmark: null,
    townId: null,
    townName: 'Nasr City',
    townNameAr: 'مدينة نصر',
    lastVisitAt: '2026-11-24T09:00:00Z',
  },
  {
    id: 'p-elezaby',
    type: 'pharmacy',
    name: 'El Ezaby',
    nameAr: 'صيدلية العزبي',
    lat: null,
    lng: null,
    geofenceRadiusMeters: 100,
    phone: null,
    address: 'شارع مكرم عبيد',
    landmark: null,
    townId: null,
    townName: 'Nasr City',
    townNameAr: 'مدينة نصر',
    lastVisitAt: '2026-11-23T11:00:00Z',
  },
]

/** The fake server's copy of the rep's shortcuts (null: never saved). */
let saved = null
const puts = []
const session = mockSession({
  user: rep,
  grants: REP_GRANTS,
  routes: {
    'GET /api/tracking/shifts/current': { status: 204 },
    'GET /api/rep-day/today': {
      body: {
        day: new Date().toISOString().slice(0, 10),
        areaId: null,
        territoryId: null,
        areaChosen: false,
        planCityId: null,
        doctorOrder: [],
        amPlaces: [],
      },
    },
    'GET /api/settings/rep-home': { body: {} },
    // No weekly plan yet.
    'GET /api/plans/mine': { body: null },
    'GET /api/account/home-shortcuts': () => ({
      body: { keys: saved, updatedAt: saved ? new Date().toISOString() : null },
    }),
    'PUT /api/account/home-shortcuts': (request) => {
      const { keys } = JSON.parse(request.body)
      puts.push(keys)
      saved = keys
      return { body: { keys, updatedAt: new Date().toISOString() } }
    },
    'GET /api/visits/recent-customers': (request) => {
      assert.equal(request.search.get('limit'), '6')
      return { body: recent }
    },
  },
})

const page = await launch()
let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

async function shot(name) {
  if (!shotsDir) return
  await page.sleep(400)
  writeFileSync(join(shotsDir, `${name}.png`), await page.screenshot())
}

const tiles = () =>
  page.evaluate(
    `[...document.querySelectorAll('[data-testid=shortcuts-grid] [data-testid^=shortcut-]')].map((a) => a.dataset.testid.replace('shortcut-', ''))`,
  )
const rows = () =>
  page.evaluate(
    `[...document.querySelectorAll('[data-testid=shortcuts-order] li')].map((li) => li.dataset.id)`,
  )

async function openHome() {
  await page.goto(`${baseUrl}/rep`)
  await page.waitFor(`document.querySelectorAll('[data-testid=shortcuts-grid] li').length > 0`, 30000)
}

try {
  await page.viewport(390, 844, true)
  await page.mockApi((request) => session(request))
  await page.goto(`${baseUrl}/login`)
  await page.evaluate(
    `localStorage.clear(); localStorage.setItem('op.language', 'ar'); localStorage.setItem('op.theme', 'light')`,
  )

  await check('Home opens with the rep defaults, four per row, in Arabic', async () => {
    await openHome()
    assert.equal(await page.evaluate(`document.documentElement.dir`), 'rtl')
    assert.deepEqual(await tiles(), [
      'startVisit',
      'todayPlan',
      'newOrder',
      'newExpense',
      'newNote',
      'doctors',
      'weeklyPlan',
      'notifications',
    ])
    assert.equal(
      await page.evaluate(
        `getComputedStyle(document.querySelector('[data-testid=shortcuts-grid]')).gridTemplateColumns.split(' ').length`,
      ),
      4,
    )
    // Arabic labels; no sideways scrolling of the page.
    assert.match(
      await page.evaluate(`document.querySelector('[data-testid=shortcut-newOrder]').textContent`),
      /طلبية/,
    )
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`))
  })

  await check('the recent customers strip shows the last visited customers', async () => {
    await page.waitFor(`document.querySelectorAll('[data-testid=recent-chip]').length === 2`)
    const names = await page.evaluate(
      `[...document.querySelectorAll('[data-testid=recent-chip]')].map((b) => b.textContent.trim())`,
    )
    assert.deepEqual(names, ['د. أحمد فتحي', 'صيدلية العزبي'])
    await shot('phone-home-shortcuts')
  })

  await check('Edit: remove a shortcut', async () => {
    await page.click('[data-testid=shortcuts-edit]')
    await page.waitFor(`document.querySelector('[data-testid=shortcuts-order]')`)
    await shot('phone-shortcuts-edit')
    await page.click('[data-testid=shortcut-remove-todayPlan]')
    await page.waitFor(`!document.querySelector('[data-testid=shortcut-remove-todayPlan]')`)
    assert.ok(!(await rows()).includes('todayPlan'))
    assert.equal((await rows()).length, 7)
  })

  await check('Edit: add from the catalog with checkmarks', async () => {
    await page.click('[data-testid=shortcuts-add]')
    await page.waitFor(`document.querySelector('[data-testid=catalog-expenses]')`)
    assert.equal(
      await page.evaluate(
        `document.querySelector('[data-testid=catalog-newOrder]').getAttribute('aria-pressed')`,
      ),
      'true',
    )
    // Only what the rep may use is offered.
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid=catalog-management]')`), false)
    await page.click('[data-testid=catalog-expenses]')
    await page.waitFor(
      `document.querySelector('[data-testid=catalog-expenses]').getAttribute('aria-pressed') === 'true'`,
    )
    await shot('phone-shortcuts-catalog')
    await page.press('Escape')
    await page.waitFor(`!document.querySelector('[data-testid=shortcuts-catalog]')`)
    assert.equal((await rows()).at(-1), 'expenses')
  })

  await check('Edit: reorder by dragging (keyboard: Space, arrow, Space)', async () => {
    await page.evaluate(
      `document.querySelectorAll('[data-testid=shortcuts-order] [data-testid=drag-handle]')[7].focus()`,
    )
    await page.press('Space')
    await page.press('ArrowUp')
    await page.press('ArrowUp')
    await page.press('Space')
    await page.waitFor(
      `document.querySelectorAll('[data-testid=shortcuts-order] li')[5]?.dataset.id === 'expenses'`,
    )
    await page.click('[data-testid=shortcuts-edit]')
    await page.waitFor(`document.querySelector('[data-testid=shortcuts-grid]')`)
    const expected = [
      'startVisit',
      'newOrder',
      'newExpense',
      'newNote',
      'doctors',
      'expenses',
      'weeklyPlan',
      'notifications',
    ]
    assert.deepEqual(await tiles(), expected)
    const end = Date.now() + 5000
    while (JSON.stringify(saved) !== JSON.stringify(expected) && Date.now() < end) await page.sleep(100)
    assert.deepEqual(saved, expected, 'the server has the new list')
    // Every change went out as one PUT of the whole list (at most eight, each once).
    assert.ok(
      puts.length >= 2 && puts.every((keys) => keys.length <= 8 && new Set(keys).size === keys.length),
    )
  })

  await check(
    'a reload keeps the edited shortcuts (from the server, also with the device copy gone)',
    async () => {
      await openHome()
      assert.deepEqual(await tiles(), saved)
      // Without the device copy the grid waits for the server instead of showing the defaults first.
      await page.evaluate(`localStorage.removeItem('op.cache.home-shortcuts')`)
      await openHome()
      assert.deepEqual(await tiles(), saved)
      await shot('phone-home-after-reload')
    },
  )

  assert.deepEqual(
    page.problems.filter((p) => !/negotiation|Failed to start the connection/.test(p)),
    [],
  )
  console.log(`\n${passed} checks passed`)
} catch (error) {
  console.error(page.problems.filter((p) => !/negotiation|Failed to start the connection/.test(p)).join('\n'))
  if (shotsDir) writeFileSync(join(shotsDir, 'home-shortcuts-failure.png'), await page.screenshot())
  throw error
} finally {
  await page.close()
}
