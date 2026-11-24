/**
 * Doctor lists on a phone (390 x 844) in Arabic, with a fake API (no backend needed): the rep's "My list"
 * and "All doctors" toggle, "Add to my list" on a doctor of the wider list, the forgiving name search
 * ("احمد" finds "أحمد"), the day / time search (5:45 to 6:00 pm finds the 5:00-6:00 doctor, not the one
 * leaving at 5:45), and a supervisor opening one rep's list. The fake doctors endpoint filters with the
 * app's own helpers (the server rules, checked against SQL in DoctorListsAndSearchTests).
 *   UI_TEST_URL=http://localhost:5173 npm run test:ui:doctor-lists
 */
import assert from 'node:assert/strict'
import { slotMatches } from '../../src/features/doctors/availability.ts'
import { searchByName } from '../../src/features/doctors/name-search.ts'
import { launch } from './browser.mjs'
import { mockSession, profile } from './mock-api.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'

const REP_ID = '00000000-0000-0000-0000-0000000000b1'
const SUPERVISOR_ID = '00000000-0000-0000-0000-0000000000b2'
const grants = (scope, ...keys) => keys.map((key) => ({ key, scope }))
const role = (key, nameAr, nameEn, level) => ({ id: `role-${key}`, key, nameAr, nameEn, level })

const rep = profile({
  id: REP_ID,
  email: 'rep@example.test',
  fullName: 'مندوب الشرق',
  preferredLanguage: 'ar',
  roles: [role('Rep', 'مندوب طبي', 'Medical rep', 40)],
  managerId: SUPERVISOR_ID,
})
const supervisor = profile({
  id: SUPERVISOR_ID,
  email: 'supervisor@example.test',
  fullName: 'مشرف الفريق',
  preferredLanguage: 'ar',
  roles: [role('Supervisor', 'مشرف', 'Supervisor', 30)],
})
const REP_GRANTS = grants(
  'own',
  'visits:read',
  'visits:create',
  'tracking:report',
  'customers:read',
  'customers:create',
  'orders:create',
  'stats:read',
)
const SUPERVISOR_GRANTS = grants(
  'team',
  'users:read',
  'visits:read',
  'customers:read',
  'customers:assign',
  'customers:create',
  'stats:read',
)

const doctor = (id, name, nameAr, slots, onMyList) => ({
  id,
  name,
  nameAr,
  townId: null,
  townName: 'Nasr City',
  townNameAr: 'مدينة نصر',
  areaId: null,
  specialtyId: null,
  specialtyNameAr: 'باطنة',
  specialtyNameEn: 'Internal medicine',
  phone: null,
  notes: null,
  isActive: true,
  reps: onMyList ? [{ id: REP_ID, fullName: rep.fullName, outsideArea: false }] : [],
  onMyList,
  outsideMyArea: false,
  geofenceRadiusMeters: 150,
  availability: slots.map(([weekday, start, end]) => ({ weekday, start, end, place: null })),
})
// The rep's list: one doctor there from 5:00 to 6:00 pm, one leaving at 5:45 pm. One more in "All".
const ahmed = doctor('d-ahmed', 'Dr. Ahmed Fathy', 'د. أحمد فتحي', [['saturday', '17:00', '18:00']], true)
const mona = doctor('d-mona', 'Dr. Mona Saeed', 'د. منى سعيد', [['saturday', '16:00', '17:45']], true)
const karim = doctor('d-karim', 'Dr. Karim Adel', 'د. كريم عادل', [], false)
let onMyList = new Set([ahmed.id, mona.id])
const requests = []

/** GET /api/doctors as the server answers it: which list, the name search, the day / time search. */
function listDoctors(search, caller) {
  requests.push({ caller, params: Object.fromEntries(search) })
  const listOf = search.get('Mine') === 'true' ? REP_ID : search.get('ListOf') || search.get('RepId')
  let rows = [ahmed, mona, karim].map((d) => ({ ...d, onMyList: caller === REP_ID && onMyList.has(d.id) }))
  if (listOf) rows = rows.filter((d) => listOf === REP_ID && onMyList.has(d.id))
  else if (caller === SUPERVISOR_ID) rows = rows.filter((d) => onMyList.has(d.id))
  const filter = { weekday: search.get('Weekday'), from: search.get('TimeFrom'), to: search.get('TimeTo') }
  if (filter.weekday || filter.from || filter.to)
    rows = rows.filter((d) => d.availability.some((slot) => slotMatches(slot, filter)))
  if (search.get('Search')) rows = searchByName(rows, search.get('Search'), (d) => [d.name, d.nameAr])
  return { body: rows }
}

function api(user, grantList) {
  const session = mockSession({
    user,
    grants: grantList,
    routes: {
      'GET /api/doctors': (request) => listDoctors(request.search, user.id),
      'GET /api/tracking/shifts/current': { status: 204 },
      'GET /api/users': {
        body: [{ id: REP_ID, fullName: rep.fullName, email: rep.email, isActive: true, roles: rep.roles }],
      },
    },
  })
  return (request) => {
    const add = /^\/api\/doctors\/([^/]+)\/my-list$/.exec(request.path)
    if (add && request.method === 'POST') {
      onMyList = new Set([...onMyList, add[1]])
      return { body: { ...[ahmed, mona, karim].find((d) => d.id === add[1]), onMyList: true } }
    }
    return session(request)
  }
}

const page = await launch()
let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

const names = () =>
  page.evaluate(`[...document.querySelectorAll('[data-testid=rep-doctor-name]')].map((p) => p.textContent)`)
const lastRequest = (caller) => requests.findLast((r) => r.caller === caller)?.params ?? {}

/** Waits for a condition on the test side (requests the fake API has seen). */
async function until(condition, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > end) throw new Error(`Timed out: ${condition}`)
    await page.sleep(100)
  }
}

/** One fake API for the whole run (re-registering it races with paused requests); this picks the user. */
let active = null
async function open(path, user, grantList) {
  active = api(user, grantList)
  await page.goto(`${baseUrl}/login`)
  await page.evaluate(
    `localStorage.clear(); localStorage.setItem('op.language', 'ar'); localStorage.setItem('op.theme', 'light')`,
  )
  await page.goto(`${baseUrl}${path}`)
}

try {
  await page.viewport(390, 844, true)
  await page.mockApi((request) => active(request))

  await check('the rep starts on "My list" and switches to "All doctors"', async () => {
    await open('/rep/doctors', rep, REP_GRANTS)
    await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 2`, 20000)
    assert.equal(await page.evaluate(`document.documentElement.dir`), 'rtl')
    assert.equal(
      await page.evaluate(
        `document.querySelector('[data-testid=doctor-list-mine]').getAttribute('aria-selected')`,
      ),
      'true',
    )
    assert.deepEqual((await names()).toSorted(), ['د. أحمد فتحي', 'د. منى سعيد'])
    assert.equal(lastRequest(REP_ID).Mine, 'true')

    await page.click('[data-testid=doctor-list-all]')
    await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 3`)
    assert.equal(lastRequest(REP_ID).Mine, undefined)
    // Only the doctor not on the list offers "Add to my list"; the others offer "Remove from my list".
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid=add-to-my-list]').length`), 1)
    assert.equal(
      await page.evaluate(`document.querySelectorAll('[data-testid=remove-from-my-list]').length`),
      2,
    )
    assert.equal(
      await page.evaluate(`document.documentElement.scrollWidth <= 390`),
      true,
      'no sideways scroll',
    )
  })

  await check('"Add to my list" puts the doctor on the list', async () => {
    await page.click('[data-testid=add-to-my-list]')
    await page.waitFor(`document.querySelectorAll('[data-testid=add-to-my-list]').length === 0`)
    await page.click('[data-testid=doctor-list-mine]')
    await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 3`)
    onMyList = new Set([ahmed.id, mona.id]) // back to the two doctors for the next checks
  })

  await check(
    '"احمد" finds "أحمد" in My list (on the phone) and in All doctors (on the server)',
    async () => {
      await open('/rep/doctors', rep, REP_GRANTS)
      await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 2`, 20000)
      await page.fill('input[type=search]', 'احمد')
      await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 1`)
      assert.deepEqual(await names(), ['د. أحمد فتحي'])
      await page.fill('input[type=search]', 'إحمد')
      await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 1`)

      await page.click('[data-testid=doctor-list-all]')
      await page.waitFor(`document.querySelectorAll('[data-testid=rep-doctor]').length === 1`)
      await until(() => lastRequest(REP_ID).Search === 'إحمد')
      assert.deepEqual(await names(), ['د. أحمد فتحي'])
    },
  )

  await check(
    'the time search 5:45 to 6:00 pm finds the 5:00-6:00 doctor, not the one leaving at 5:45',
    async () => {
      await page.click('[data-testid=doctor-list-mine]')
      await page.click('[data-testid=open-hours-search]')
      await page.waitFor(`document.querySelector('[data-testid=doctor-hours-search] #hours-weekday')`)
      await page.evaluate(`(() => {
      const select = document.querySelector('#hours-weekday')
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'saturday')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
      await page.fill('#hours-from', '17:45')
      await page.fill('#hours-to', '18:00')
      await page.waitFor(`document.querySelectorAll('[data-testid=hours-result]').length === 1`)
      const params = lastRequest(REP_ID)
      assert.deepEqual(
        [params.Mine, params.Weekday, params.TimeFrom, params.TimeTo],
        ['true', 'saturday', '17:45', '18:00'],
      )
      const row = await page.evaluate(`document.querySelector('[data-testid=hours-result]').textContent`)
      assert.ok(row.includes('د. أحمد فتحي'), row)
      // The matching window is shown on the row.
      assert.equal(
        await page.evaluate(`document.querySelectorAll('[data-testid=hours-result-slots] > *').length`),
        1,
      )

      // Name and time together.
      await page.fill('#hours-name', 'منى')
      await until(() => lastRequest(REP_ID).Search === 'منى')
      await page.waitFor(`!document.querySelector('[data-testid=hours-result]')`)
    },
  )

  await check("a supervisor picks a rep and sees that rep's list", async () => {
    await open('/admin/doctors', supervisor, SUPERVISOR_GRANTS)
    await page.waitFor(`document.querySelector('[data-testid=open-filters]')`, 20000)
    await page.click('[data-testid=open-filters]')
    await page.waitFor(`document.querySelector('[data-testid=doctor-rep-filter] option[value="${REP_ID}"]')`)
    await page.evaluate(`(() => {
      const select = document.querySelector('[data-testid=doctor-rep-filter]')
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(REP_ID)})
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await page.click('[data-testid=apply-filters]')
    await page.waitFor(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(rep.fullName)})`)
    assert.equal(await page.evaluate(`document.querySelector('h1').textContent`), `أطباء: ${rep.fullName}`)
    assert.equal(lastRequest(SUPERVISOR_ID).ListOf, REP_ID)
    await page.waitFor(
      `document.body.textContent.includes('د. أحمد فتحي') && document.body.textContent.includes('د. منى سعيد')`,
    )
    assert.ok(!(await page.evaluate(`document.body.textContent.includes('د. كريم عادل')`)))
  })

  // The live-updates hub is not under /api, so it has no fake behind it and cannot connect here.
  assert.deepEqual(
    page.problems.filter((p) => !p.includes('negotiation')),
    [],
    'no console errors',
  )
  console.log(`\n${passed} checks passed`)
} finally {
  await page.close()
}
