/**
 * The duplicate warning when a rep adds a doctor, on a phone (390 x 844) in Arabic with a fake API: typing
 * a name like one already in the town shows "Similar ones already exist in this area" with that doctor,
 * and "This is the same doctor - add to my list" puts the existing doctor on the list instead of a new one.
 *   UI_TEST_URL=http://localhost:5173 npm run test:ui:duplicates
 */
import assert from 'node:assert/strict'
import { launch } from './browser.mjs'
import { mockSession, profile } from './mock-api.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'

const REP_ID = '00000000-0000-0000-0000-0000000000c1'
const TOWN_ID = '00000000-0000-0000-0000-0000000000c2'
const rep = profile({
  id: REP_ID,
  email: 'rep@example.test',
  fullName: 'مندوب الشرق',
  preferredLanguage: 'ar',
  roles: [{ id: 'role-rep', key: 'Rep', nameAr: 'مندوب طبي', nameEn: 'Medical rep', level: 40 }],
})
const grants = ['visits:read', 'visits:create', 'customers:read', 'customers:create', 'stats:read'].map(
  (key) => ({ key, scope: 'own' }),
)
const town = {
  id: TOWN_ID,
  name: 'Nasr City',
  nameAr: 'مدينة نصر',
  areaId: 'area',
  areaName: 'East Cairo',
  areaNameAr: 'شرق القاهرة',
  defaultDailyExpense: 0,
}
const existing = {
  id: 'd-existing',
  type: 'doctor',
  name: 'Dr. Ahmed Mohamed Ali',
  nameAr: 'د. أحمد محمد علي',
  townName: town.name,
  townNameAr: town.nameAr,
  areaName: town.areaName,
  areaNameAr: town.areaNameAr,
  same: false,
  limited: false,
  address: 'شارع عباس العقاد',
  landmark: null,
  addedByName: 'مندوب آخر',
  inMyList: false,
  isInactive: false,
}
const similarAsked = []
const added = []
let created = 0

const page = await launch()
try {
  await page.viewport(390, 844, true)
  await page.mockApi((request) => {
    if (request.method === 'GET' && request.path === '/api/customers/similar') {
      const params = Object.fromEntries(request.search)
      similarAsked.push(params)
      const hit =
        params.Type === 'doctor' && params.TerritoryId === TOWN_ID && (params.Name ?? '').includes('محمد')
      return { body: hit ? [existing] : [] }
    }
    if (request.method === 'POST' && request.path === `/api/doctors/${existing.id}/my-list`) {
      added.push(existing.id)
      return {
        body: { id: existing.id, name: existing.name, nameAr: existing.nameAr, reps: [], onMyList: true },
      }
    }
    if (request.method === 'POST' && request.path === '/api/doctors') created++
    return mockSession({
      user: rep,
      grants,
      routes: {
        'GET /api/lookups/towns': { body: [town] },
        'GET /api/lookups/specialties': {
          body: [{ id: 'sp', nameAr: 'باطنة', nameEn: 'Internal medicine', isActive: true, sortOrder: 0 }],
        },
        'GET /api/tracking/shifts/current': { status: 204 },
      },
    })(request)
  })

  await page.goto(`${baseUrl}/login`)
  await page.evaluate(
    `localStorage.clear(); localStorage.setItem('op.language', 'ar'); localStorage.setItem('op.theme', 'light')`,
  )
  await page.goto(`${baseUrl}/rep/doctors`)
  await page.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'إضافة طبيب')`,
    20000,
  )
  assert.equal(await page.evaluate(`document.documentElement.dir`), 'rtl')
  await page.evaluate(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'إضافة طبيب').click()`,
  )
  await page.waitFor(
    `[...document.querySelectorAll('[role=tab]')].some((b) => b.textContent.includes('طبيب جديد'))`,
  )
  await page.evaluate(
    `[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('طبيب جديد')).click()`,
  )
  await page.waitFor(`document.querySelector('#doctor-town option[value="${TOWN_ID}"]')`)
  await page.evaluate(`(() => {
    const select = document.querySelector('#doctor-town')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(TOWN_ID)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await page.fill('#doctor-name', 'احمد محمد')

  await page.waitFor(`document.querySelector('[data-testid=similar-customers]')`, 10000)
  const notice = await page.evaluate(`document.querySelector('[data-testid=similar-customers]').textContent`)
  assert.ok(notice.includes('توجد أسماء مشابهة في هذه المنطقة'), notice)
  assert.ok(notice.includes('د. أحمد محمد علي'), notice)
  assert.ok(notice.includes('أضافه مندوب آخر'), notice)
  assert.deepEqual(
    [similarAsked.at(-1).Type, similarAsked.at(-1).TerritoryId, similarAsked.at(-1).Name],
    ['doctor', TOWN_ID, 'احمد محمد'],
  )
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= 390`), true, 'no sideways scroll')
  console.log('ok - typing a similar doctor name shows the warning with the existing doctor')

  await page.click('[data-testid=similar-same-doctor]')
  await page.waitFor(`!document.querySelector('[data-testid=similar-customers]')`, 10000)
  assert.deepEqual(added, [existing.id])
  assert.equal(created, 0, 'no new doctor was created')
  console.log('ok - "This is the same doctor - add to my list" adds the existing doctor')
  console.log('2 checks passed')
} finally {
  await page.close()
}
