/**
 * Dashboard polish on a desktop (1366 x 900) in Arabic, with a fake API (no backend needed): sign-out asks
 * first (Cancel is focused, Escape and Cancel keep the session), the sidebar logo goes to the dashboard,
 * clicking a doctors row opens its primary action (the doctor's details) while the row's own buttons and
 * checkbox keep theirs, and the roles hierarchy renders as a tree.
 *   UI_TEST_URL=http://localhost:5173 npm run test:ui:admin-polish
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './browser.mjs'
import { mockSession, profile } from './mock-api.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const shotsDir = process.env.UI_SHOTS_DIR

const grants = [
  'users:read',
  'roles:read',
  'roles:manage',
  'customers:read',
  'customers:manage',
  'customers:delete',
  'visits:read',
  'orders:read',
  'products:read',
  'stats:read',
  'tracking:history',
  'settings:manage',
].map((key) => ({ key, scope: 'all' }))
const admin = profile({ fullName: 'مدير النظام', preferredLanguage: 'ar' })

const role = (id, key, nameAr, nameEn, level, userCount, extra = {}) => ({
  id,
  key,
  nameAr,
  nameEn,
  description: null,
  isSystem: true,
  level,
  permissionsLocked: false,
  userCount,
  permissions: [],
  maxDiscountPercent: null,
  ...extra,
})
const roles = [
  role(admin.roles[0].id, 'Admin', 'مدير النظام', 'System admin', 0, 1, { permissionsLocked: true }),
  role('r-sales', 'SalesManager', 'مدير المبيعات', 'Sales manager', 10, 2),
  role('r-supervisor', 'Supervisor', 'مشرف', 'Supervisor', 30, 4),
  role('r-rep', 'Rep', 'مندوب طبي', 'Medical rep', 40, 18),
  role('r-am', 'AmRep', 'مندوب مستشفيات', 'Hospital rep', 40, 3, { isSystem: false }),
]
const permissions = ['customers:read', 'visits:read'].map((key) => ({
  key,
  resource: key.split(':')[0],
  action: key.split(':')[1],
  description: key,
}))
const doctor = (id, name, nameAr) => ({
  id,
  name,
  nameAr,
  townId: 't1',
  townName: 'Nasr City',
  townNameAr: 'مدينة نصر',
  areaId: null,
  specialtyId: null,
  specialtyNameAr: 'باطنة',
  specialtyNameEn: 'Internal medicine',
  phone: '01001234567',
  notes: null,
  isActive: true,
  reps: [],
  onMyList: false,
  outsideMyArea: false,
  geofenceRadiusMeters: 150,
  availability: [],
})
const doctors = [
  doctor('d1', 'Dr. Ahmed Fathy', 'د. أحمد فتحي'),
  doctor('d2', 'Dr. Mona Saeed', 'د. منى سعيد'),
]
let signedOut = false
const session = mockSession({
  user: admin,
  grants,
  routes: {
    'GET /api/roles': { body: roles },
    'GET /api/permissions': { body: permissions },
    'GET /api/doctors': { body: doctors },
    'GET /api/doctors/d1': { body: doctors[0] },
    'GET /api/doctors/d2': { body: doctors[1] },
    'GET /api/doctors/d1/location-history': {
      body: {
        doctorId: 'd1',
        name: doctors[0].name,
        nameAr: doctors[0].nameAr,
        lat: null,
        lng: null,
        geofenceRadiusMeters: 150,
        locationSource: null,
        locationCapturedAt: null,
        locationCapturedByName: null,
        locationAccuracyMeters: null,
        locationVisitId: null,
        medianLat: null,
        medianLng: null,
        visits: [],
        capped: false,
      },
    },
    'POST /api/auth/logout': () => {
      signedOut = true
      return { status: 204 }
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
const exists = (selector) => page.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)
const path = () => page.evaluate('location.pathname')

async function openDoctors() {
  await page.goto(`${baseUrl}/admin/doctors`)
  await page.waitFor(`document.querySelectorAll('tbody tr[data-clickable]').length === 2`, 30000)
}

try {
  await page.viewport(1366, 900)
  await page.mockApi((request) => session(request))
  await page.goto(`${baseUrl}/login`)
  await page.evaluate(
    `localStorage.clear(); localStorage.setItem('op.language', 'ar'); localStorage.setItem('op.theme', 'light')`,
  )

  await check('sign-out asks first; Cancel is focused, and Escape or Cancel keep the session', async () => {
    await openDoctors()
    assert.equal(await page.evaluate(`document.documentElement.dir`), 'rtl')
    await page.click('[data-testid=header-sign-out]')
    await page.waitFor(`document.querySelector('[data-testid=confirm-dialog]')`)
    await shot('sign-out-dialog')
    assert.match(
      await page.evaluate(`document.querySelector('[data-testid=confirm-dialog] h2').textContent`),
      /تسجيل الخروج؟/,
    )
    assert.equal(await page.evaluate(`document.activeElement.textContent.trim()`), 'إلغاء')
    await page.press('Escape')
    await page.waitFor(`!document.querySelector('[data-testid=confirm-dialog]')`)
    assert.equal(await path(), '/admin/doctors')

    await page.click('[data-testid=header-sign-out]')
    await page.waitFor(`document.querySelector('[data-testid=confirm-dialog]')`)
    await page.evaluate(
      `[...document.querySelectorAll('[data-testid=confirm-dialog] button')].find((b) => b.textContent.trim() === 'إلغاء').click()`,
    )
    await page.waitFor(`!document.querySelector('[data-testid=confirm-dialog]')`)
    await page.sleep(300)
    assert.equal(await path(), '/admin/doctors')
    assert.equal(signedOut, false)
  })

  await check('the sidebar logo is a labelled link to the dashboard', async () => {
    assert.match(
      await page.evaluate(`document.querySelector('[data-testid=sidebar-logo]').getAttribute('aria-label')`),
      /لوحة التحكم/,
    )
    await page.click('[data-testid=sidebar-logo]')
    await page.waitFor(`location.pathname === '/admin'`)
  })

  await check('clicking a doctors row opens its primary action; its own controls keep theirs', async () => {
    await openDoctors()
    await shot('doctors-table')
    const firstRow = `document.querySelectorAll('tbody tr[data-clickable]')[0]`
    // A plain cell (the town) opens the doctor's details.
    await page.evaluate(`${firstRow}.querySelectorAll('td')[3].click()`)
    await page.waitFor(`document.querySelector('[data-testid=doctor-details]')`)
    await shot('doctors-row-click')
    await page.press('Escape')
    await page.waitFor(`!document.querySelector('[data-testid=doctor-details]')`)

    // The row's location button opens its own sheet, not the details.
    await page.evaluate(`${firstRow}.querySelector('[data-testid=doctor-location-open]').click()`)
    await page.waitFor(`document.querySelector('[data-testid=doctor-location-sheet]')`)
    assert.equal(await exists('[data-testid=doctor-details]'), false)
    await page.press('Escape')
    await page.waitFor(`!document.querySelector('[data-testid=doctor-location-sheet]')`)

    // Delete opens the delete dialog only.
    await page.evaluate(`${firstRow}.querySelector('td:last-child button.text-destructive').click()`)
    await page.waitFor(`document.querySelector('[data-testid=delete-dialog]')`)
    assert.equal(await exists('[data-testid=doctor-details]'), false)
    await page.press('Escape')
    await page.waitFor(`!document.querySelector('[data-testid=delete-dialog]')`)

    // The checkbox selects the row and nothing else.
    await page.evaluate(`${firstRow}.querySelector('[role=checkbox]').click()`)
    await page.waitFor(`${firstRow}.dataset.state === 'selected'`)
    await page.sleep(300)
    assert.equal(await exists('[data-testid=doctor-details]'), false)

    // Enter on the focused row opens it too; the row shows it can be clicked.
    assert.equal(await page.evaluate(`getComputedStyle(${firstRow}).cursor`), 'pointer')
    await page.evaluate(`document.querySelectorAll('tbody tr[data-clickable]')[1].focus()`)
    await page.press('Enter')
    await page.waitFor(`document.querySelector('[data-testid=doctor-details]')`)
    await page.press('Escape')
  })

  await check('the roles hierarchy tab renders an org tree', async () => {
    await page.goto(`${baseUrl}/admin/roles`)
    await page.waitFor(`document.body.innerText.includes('مندوب طبي')`, 30000)
    await page.evaluate(`[...document.querySelectorAll('button[aria-pressed]')][1].click()`)
    await page.waitFor(`document.querySelector('[data-testid=role-tree]')`)
    await shot('roles-hierarchy')
    // One tier per level (0, 10, 30, 40); the two level-40 roles side by side.
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid=role-tier]').length`), 4)
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid=role-node]').length`), 5)
    assert.equal(
      await page.evaluate(
        `document.querySelectorAll('[data-testid=role-tier]')[3].querySelectorAll('[data-testid=role-node]').length`,
      ),
      2,
    )
    // The admin role is marked locked; clicking a role opens it in the Roles tab, as before.
    assert.match(
      await page.evaluate(`document.querySelectorAll('[data-testid=role-node]')[0].textContent`),
      /صلاحيات مقفلة/,
    )
    await page.evaluate(`document.querySelectorAll('[data-testid=role-node]')[2].click()`)
    await page.waitFor(`!document.querySelector('[data-testid=role-tree]')`)
    assert.match(await page.evaluate(`document.body.innerText`), /تفاصيل الدور/)
  })

  assert.deepEqual(
    page.problems.filter((p) => !/negotiation|Failed to start the connection/.test(p)),
    [],
  )
  console.log(`\n${passed} checks passed`)
} catch (error) {
  console.error(page.problems.filter((p) => !/negotiation|Failed to start the connection/.test(p)).join('\n'))
  if (shotsDir) writeFileSync(join(shotsDir, 'admin-polish-failure.png'), await page.screenshot())
  throw error
} finally {
  await page.close()
}
