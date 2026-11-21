/**
 * Every management screen on a phone (390 x 844): no sideways scrolling of the page, the main action
 * on screen, a create and an edit flow, the More menu limited to what the role may open, and
 * managers kept out of the rep app's tracking. Creates and edits data, so run it against a
 * throwaway database with the demo data:
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:phone
 * UI_SCREENSHOTS=<folder> also saves screenshots of key screens in Arabic and English, light and dark.
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const password = process.env.UI_TEST_PASSWORD
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')
const screenshots = process.env.UI_SCREENSHOTS
/** Screenshots of the weekly plan screens (360 and 430 px, both languages and themes). */
const planScreenshots = process.env.UI_PLAN_SCREENSHOTS
/** Screenshots of the rep's "Add pharmacy" sheet (360 and 430 px, both languages and themes). */
const pharmacyScreenshots = process.env.UI_PHARMACY_SCREENSHOTS
const en = JSON.parse(readFileSync(new URL('../../src/lib/i18n/locales/en.json', import.meta.url), 'utf8'))
const ar = JSON.parse(readFileSync(new URL('../../src/lib/i18n/locales/ar.json', import.meta.url), 'utf8'))
const locales = { ar, en }

/** Each screen, with the label of its main action when it has one (English). */
const SCREENS = [
  { path: '/admin', title: en.nav.dashboard },
  { path: '/admin/live-map', title: en.liveMap.title },
  { path: '/admin/statistics', title: en.nav.statistics },
  { path: '/admin/notifications', title: en.nav.notifications, action: en.notifications.markAllRead },
  { path: '/admin/doctors', title: en.nav.doctors },
  { path: '/admin/customers', title: en.nav.customers },
  { path: '/admin/visits', title: en.nav.visits },
  { path: '/admin/expenses', title: en.nav.expenses },
  { path: '/admin/plans', title: en.nav.plans },
  { path: '/admin/territories', title: en.nav.territories },
  { path: '/admin/orders', title: en.nav.orders },
  { path: '/admin/products', title: en.nav.products },
  { path: '/admin/flags', title: en.nav.flags },
  { path: '/admin/suspicious-activity', title: en.nav.suspicious },
  { path: '/admin/devices', title: en.nav.devices },
  { path: '/admin/users', title: en.nav.users },
  { path: '/admin/roles', title: en.nav.roles },
  { path: '/admin/lookups', title: en.nav.lookups, action: en.lookups.specialties.add },
  { path: '/admin/activity', title: en.nav.activity },
  { path: '/admin/settings', title: en.nav.settings },
]

const page = await launch()
let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

/** In-app navigation (no reload: sign-in and refresh calls are rate limited). */
async function go(path) {
  await page.evaluate(
    `window.history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate'))`,
  )
  await page.waitFor(
    `location.pathname === ${JSON.stringify(path)} || location.pathname === ${JSON.stringify(path + '/')}`,
  )
  await page.waitFor(
    `document.querySelector('main h1') && !document.querySelector('main [role=status] .animate-spin')`,
    20000,
  )
  await page.sleep(400)
}

const pageOverflow = () => page.evaluate(`document.documentElement.scrollWidth - window.innerWidth`)

/**
 * Calls the API as the signed-in user. One access token per sign-in is enough (it lasts 15 minutes);
 * refreshing for every call would run into the sign-in rate limit.
 */
let apiToken = null
const api = async (path, options = {}) => {
  apiToken ??= await page.evaluate(`fetch('/api/auth/refresh', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'web' }),
    }).then((r) => r.json()).then((auth) => auth.accessToken)`)
  return page.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(path)}, {
      method: ${JSON.stringify(options.method ?? 'GET')},
      headers: { Authorization: 'Bearer ' + ${JSON.stringify(apiToken)}, 'Content-Type': 'application/json' },
      body: ${options.body ? JSON.stringify(JSON.stringify(options.body)) : 'undefined'},
    })
    const body = response.status === 204 ? null : await response.json()
    if (!response.ok) throw new Error(response.status + ' ' + JSON.stringify(body))
    return body
  })()`)
}

const COMBOS = ['ar', 'en'].flatMap((language) => ['light', 'dark'].map((theme) => ({ language, theme })))
const WIDTHS = [360, 430]

/** Reloads the app on `path` in another language and theme (as a returning user has them). */
async function reopenAs(path, { language, theme }) {
  await page.evaluate(
    `localStorage.setItem('op.language', '${language}'); localStorage.setItem('op.theme', '${theme}')`,
  )
  await page.goto(`${baseUrl}${path}`)
  await page.waitFor(
    `document.querySelector('main h1') && !document.querySelector('main [role=status] .animate-spin')`,
    20000,
  )
}

async function shoot(name, folder = planScreenshots) {
  if (!folder) return
  mkdirSync(folder, { recursive: true })
  await page.sleep(500)
  writeFileSync(join(folder, `${name}.png`), await page.screenshot())
}

/** The open dialog spans the phone's width and sits on its bottom edge. */
async function assertBottomSheet(width) {
  const r = await page.evaluate(
    `(() => { const r = document.querySelector('[role=dialog]').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom } })()`,
  )
  assert.ok(
    r.left <= 1 && r.right >= width - 1 && r.bottom >= 843,
    `bottom sheet at ${width}px: ${JSON.stringify(r)}`,
  )
}

async function closeDialog() {
  await page.click('[role=dialog] [data-slot=dialog-close]')
  await page.waitFor(`!document.querySelector('[role=dialog]')`)
}

/** The button is on screen horizontally and nothing covers its centre once scrolled to. */
async function reachable(label) {
  return page.evaluate(`(() => {
    const button = [...document.querySelectorAll('main button, main a')].find((b) => b.textContent.trim().includes(${JSON.stringify(label)}))
    if (!button) return 'missing'
    button.scrollIntoView({ block: 'center' })
    const r = button.getBoundingClientRect()
    if (r.left < 0 || r.right > window.innerWidth) return 'off screen'
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return button.contains(top) ? 'ok' : 'covered by ' + (top?.tagName ?? '?')
  })()`)
}

const navItems = () =>
  page.evaluate(`[
    ...[...document.querySelectorAll('[data-testid=phone-tab-bar] a')].map((a) => a.getAttribute('href')),
    ...[...document.querySelectorAll('[data-testid=more-menu] a')].map((a) => a.getAttribute('href')),
  ]`)

async function openMore() {
  await page.click('[data-testid=tab-more]')
  await page.waitFor(`document.querySelector('[data-testid=more-menu]')`)
  await page.sleep(300)
}

async function closeMore() {
  await page.click('[data-testid=more-menu] [data-slot=sheet-close]')
  await page.waitFor(`!document.querySelector('[data-testid=more-menu]')`)
}

async function signOutFromMore() {
  await openMore()
  await page.click('[data-testid=more-sign-out]')
  await page.waitFor(`location.pathname.startsWith('/login')`)
}

try {
  await page.viewport(390, 844, true)
  await signIn(page, baseUrl, 'admin@originalpharma.local', password)

  for (const screen of SCREENS) {
    await check(
      `${screen.path}: fits the phone${screen.action ? ', main action reachable' : ''}`,
      async () => {
        await go(screen.path)
        const overflow = await pageOverflow()
        assert.ok(overflow <= 1, `page scrolls sideways by ${overflow}px`)
        assert.ok(
          await page.evaluate(`Boolean(document.querySelector('[data-testid=phone-tab-bar]'))`),
          'bottom bar shown',
        )
        if (screen.action) assert.equal(await reachable(screen.action), 'ok')
      },
    )
  }

  await check('lists become cards with their actions in a menu', async () => {
    await go('/admin/users')
    await page.waitFor(`document.querySelector('[data-testid=card-row]')`)
    assert.ok(await page.evaluate(`document.querySelectorAll('[data-testid=card-row]').length > 0`))
    assert.equal(await page.evaluate(`document.querySelectorAll('main table').length`), 0)
    await page.click('[data-testid=row-actions]')
    await page.waitFor(`document.querySelector('[data-testid=row-actions-sheet]')`)
    const labels = await page.evaluate(
      `[...document.querySelectorAll('[data-testid=row-actions-sheet] button:not([data-slot=sheet-close])')].map((b) => getComputedStyle(b, '::after').content.replaceAll('"', '') + b.textContent.trim())`,
    )
    assert.ok(labels.length > 0 && labels.every((l) => l && l !== 'none'), JSON.stringify(labels))
    await page.click('[data-testid=row-actions-sheet] [data-slot=sheet-close]')
    await page.waitFor(`!document.querySelector('[role=dialog]')`)
  })

  await check('filters open in a bottom sheet and show as removable chips', async () => {
    await page.click('[data-testid=open-filters]')
    await page.waitFor(`document.querySelector('[data-testid=filter-sheet] select')`)
    await page.evaluate(`(() => {
      const select = document.querySelector('[data-testid=filter-sheet] select')
      select.value = 'Rep'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await page.click('[data-testid=apply-filters]')
    await page.waitFor(`document.querySelector('[data-testid=filter-chips] button')`)
    await page.click('[data-testid=filter-chips] button')
    await page.waitFor(`!document.querySelector('[data-testid=filter-chips]')`)
  })

  await check('create on a phone: a new specialty from a bottom-sheet dialog', async () => {
    const run = Date.now() % 100000
    const name = `Phone specialty ${run}`
    await go('/admin/lookups')
    await page.evaluate(
      `[...document.querySelectorAll('main button')].find((b) => b.textContent.includes(${JSON.stringify(en.lookups.specialties.add)})).click()`,
    )
    await page.waitFor(`document.querySelector('#lookup-en')`)
    const dialog = await page.evaluate(
      `(() => { const r = document.querySelector('[role=dialog]').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom } })()`,
    )
    assert.ok(
      dialog.left <= 1 && dialog.right >= 389 && dialog.bottom >= 843,
      `dialog is a full-width bottom sheet: ${JSON.stringify(dialog)}`,
    )
    await page.fill('#lookup-ar', `تخصص ${run}`)
    await page.fill('#lookup-en', name)
    await page.evaluate(`document.querySelector('[role=dialog] button[type=submit]').click()`)
    await page.waitFor(`!document.querySelector('[role=dialog]')`)
    // The list pages; find the new entry with the search box.
    await page.fill('main input[type=search]', name)
    await page.waitFor(`document.querySelector('main').textContent.includes(${JSON.stringify(name)})`)
  })

  await check('edit on a phone: rename a user from the row menu', async () => {
    await go('/admin/users')
    await page.waitFor(
      `[...document.querySelectorAll('[data-testid=card-row]')].some((r) => r.textContent.includes('Demo Rep'))`,
    )
    const renamed = 'Demo Rep Edited'
    const rowNamed = (name) =>
      `[...document.querySelectorAll('[data-testid=card-row]')].find((r) => [...r.querySelectorAll('span')].some((s) => s.textContent.trim() === ${JSON.stringify(name)}))`
    await page.evaluate(`${rowNamed('Demo Rep')}.querySelector('[data-testid=row-actions]').click()`)
    await page.waitFor(`document.querySelector('[data-testid=row-actions-sheet]')`)
    await page.evaluate(
      `document.querySelector('[data-testid=row-actions-sheet] button:not([data-slot=sheet-close])').click()`,
    )
    await page.waitFor(`document.querySelector('[role=dialog] #edit-user-name')`)
    await page.fill('[role=dialog] #edit-user-name', renamed)
    await page.evaluate(`document.querySelector('[role=dialog] button[type=submit]').click()`)
    await page.waitFor(
      `!document.querySelector('[role=dialog] #edit-user-name') && document.querySelector('main').textContent.includes(${JSON.stringify(renamed)})`,
    )

    // Back to the demo name for the other checks.
    await page.evaluate(`${rowNamed(renamed)}.querySelector('[data-testid=row-actions]').click()`)
    await page.waitFor(`document.querySelector('[data-testid=row-actions-sheet]')`)
    await page.evaluate(
      `document.querySelector('[data-testid=row-actions-sheet] button:not([data-slot=sheet-close])').click()`,
    )
    await page.waitFor(`document.querySelector('[role=dialog] #edit-user-name')`)
    await page.fill('[role=dialog] #edit-user-name', 'Demo Rep')
    await page.evaluate(`document.querySelector('[role=dialog] button[type=submit]').click()`)
    await page.waitFor(`!document.querySelector('[role=dialog] #edit-user-name')`)
  })

  await check('the admin bar has four pages and More has every other page', async () => {
    await go('/admin')
    const bar = await page.evaluate(`document.querySelectorAll('[data-testid=phone-tab-bar] a').length`)
    assert.equal(bar, 4)
    await openMore()
    const all = await navItems()
    for (const screen of SCREENS) assert.ok(all.includes(screen.path), `${screen.path} reachable`)
    await closeMore()
  })

  await check('managers are not sent into the rep app and see no tracking prompts', async () => {
    await page.evaluate(
      `window.history.pushState({}, '', '/rep'); window.dispatchEvent(new PopStateEvent('popstate'))`,
    )
    await page.waitFor(`location.pathname.startsWith('/admin')`)
    assert.equal(
      await page.evaluate(
        `Boolean(document.querySelector('[data-testid=tracking-health-banner], [data-testid=mock-location-notice]'))`,
      ),
      false,
    )
  })

  if (screenshots) {
    mkdirSync(screenshots, { recursive: true })
    for (const language of ['ar', 'en']) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(
          `localStorage.setItem('op.language', '${language}'); localStorage.setItem('op.theme', '${theme}')`,
        )
        await page.goto(`${baseUrl}/admin`)
        await page.waitFor(`document.querySelector('[data-testid=phone-tab-bar]')`, 20000)
        for (const path of [
          '/admin',
          '/admin/visits',
          '/admin/orders',
          '/admin/live-map',
          '/admin/statistics',
          '/admin/users',
        ]) {
          await go(path)
          await page.sleep(800)
          writeFileSync(
            join(screenshots, `${language}-${theme}${path.replaceAll('/', '-')}.png`),
            await page.screenshot(),
          )
        }
        await openMore()
        writeFileSync(join(screenshots, `${language}-${theme}-more-menu.png`), await page.screenshot())
        await closeMore()
      }
    }
    await page.evaluate(
      `localStorage.setItem('op.language', 'en'); localStorage.setItem('op.theme', 'light')`,
    )
    console.log(`# screenshots in ${screenshots}`)
  }

  await check('a supervisor sees only the pages their role allows', async () => {
    await signOutFromMore()
    await signIn(page, baseUrl, 'supervisor@demo.local', password)
    await page.waitFor(`location.pathname.startsWith('/admin')`)
    await page.waitFor(`document.querySelector('[data-testid=phone-tab-bar]')`)
    await openMore()
    const all = await navItems()
    for (const hidden of ['/admin/roles', '/admin/lookups', '/admin/activity', '/admin/settings']) {
      assert.ok(!all.includes(hidden), `${hidden} hidden from a supervisor`)
    }
    for (const shown of [
      '/admin',
      '/admin/visits',
      '/admin/orders',
      '/admin/users',
      '/admin/suspicious-activity',
    ]) {
      assert.ok(all.includes(shown), `${shown} shown to a supervisor`)
    }
    await closeMore()
  })

  await check('a rep signs in to the rep app', async () => {
    await signOutFromMore()
    await signIn(page, baseUrl, 'rep@demo.local', password)
    await page.waitFor(`location.pathname.startsWith('/rep')`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-testid=phone-tab-bar]'))`), false)
  })

  await check("add pharmacy: the rep's sheet fits 360-430 px in ar/en, light and dark", async () => {
    for (const combo of COMBOS) {
      await reopenAs('/rep/doctors', combo)
      await page.click('[data-testid=tab-pharmacies]')
      await page.waitFor(`document.querySelector('[data-testid=add-pharmacy]')`, 20000)
      for (const width of WIDTHS) {
        await page.viewport(width, 844, true)
        await page.sleep(300)
        const overflow = await pageOverflow()
        assert.ok(overflow <= 1, `pharmacies scroll sideways by ${overflow}px at ${width}px`)
        assert.equal(
          await reachable(locales[combo.language].pharmacies.add),
          'ok',
          `add reachable at ${width}px`,
        )
        await page.click('[data-testid=add-pharmacy]')
        await page.waitFor(
          `document.querySelector('[data-testid=add-pharmacy-sheet] #pharmacy-new-town optgroup')`,
          20000,
        )
        const r = await page.evaluate(
          `(() => { const r = document.querySelector('[data-testid=add-pharmacy-sheet]').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom } })()`,
        )
        assert.ok(
          r.left <= 1 && r.right >= width - 1 && r.bottom >= 843,
          `bottom sheet at ${width}px: ${JSON.stringify(r)}`,
        )
        const save = await page.evaluate(
          `document.querySelector('[data-testid=add-pharmacy-save]').getBoundingClientRect().height`,
        )
        assert.ok(save >= 44, `save button is ${save}px high`)
        await shoot(`rep-add-pharmacy-${combo.language}-${combo.theme}-${width}`, pharmacyScreenshots)
        await page.click('[data-testid=add-pharmacy-sheet] [data-slot=sheet-close]')
        await page.waitFor(`!document.querySelector('[data-testid=add-pharmacy-sheet]')`)
      }
      await page.viewport(390, 844, true)
      await page.evaluate(`window.scrollTo(0, 0)`)
      await shoot(`rep-pharmacies-${combo.language}-${combo.theme}`, pharmacyScreenshots)
    }
  })

  let planId
  await check('weekly plans: the rep screens fit 360-430 px in ar/en, light and dark', async () => {
    // A draft for next week, so the day editor can be opened.
    const towns = await api('/api/lookups/towns')
    const nasr = towns.find((t) => t.name === 'Nasr City')
    const current = await api('/api/plans/mine')
    // The first later week the rep may still change (an earlier run may have sent next week's plan).
    let nextWeek
    for (let i = 1; i <= 12 && !nextWeek; i++) {
      const week = new Date(Date.parse(`${current.weekStart}T12:00:00Z`) + i * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10)
      if ((await api(`/api/plans/mine?week=${week}`)).canEdit) nextWeek = week
    }
    assert.ok(nextWeek, 'a later week is open for planning')
    const draft = await api('/api/plans/mine', {
      method: 'PUT',
      body: {
        week: nextWeek,
        days: [
          { day: nextWeek, cityId: nasr.id, targetVisits: 6, note: 'Morning clinics', customerIds: [] },
          {
            day: new Date(Date.parse(`${nextWeek}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
            cityId: nasr.id,
            targetVisits: 4,
            customerIds: [],
          },
        ],
      },
    })
    planId = draft.id
    for (const combo of COMBOS) {
      await reopenAs(`/rep/plans?week=${nextWeek}`, combo)
      await page.waitFor(`document.querySelectorAll('[data-testid=plan-day]').length === 7`, 20000)
      for (const width of WIDTHS) {
        await page.viewport(width, 844, true)
        await page.sleep(300)
        const overflow = await pageOverflow()
        assert.ok(overflow <= 1, `/rep/plans scrolls sideways by ${overflow}px at ${width}px`)
        assert.equal(
          await reachable(locales[combo.language].plans.submit),
          'ok',
          `submit reachable at ${width}px`,
        )
        await page.evaluate(`window.scrollTo(0, 0)`)
        await shoot(`rep-plan-${combo.language}-${combo.theme}-${width}`)
        await page.click('[data-testid=plan-day-edit]')
        await page.waitFor(`document.querySelector('[data-testid=plan-day-dialog] #plan-city')`)
        await assertBottomSheet(width)
        const targets = await page.evaluate(
          `[...document.querySelectorAll('[data-testid=plan-target-less], [data-testid=plan-target-more]')].map((b) => b.getBoundingClientRect().height)`,
        )
        assert.ok(
          targets.every((h) => h >= 44),
          `stepper buttons are 44 px: ${targets}`,
        )
        await shoot(`rep-plan-day-dialog-${combo.language}-${combo.theme}-${width}`)
        await closeDialog()
      }
      await page.viewport(390, 844, true)
      await go('/rep')
      await page.waitFor(`document.querySelector('[data-testid=home-week-plan]')`, 20000)
      await page.evaluate(
        `document.querySelector('[data-testid=home-week-plan]').scrollIntoView({ block: 'center' })`,
      )
      await shoot(`rep-home-card-${combo.language}-${combo.theme}`)
    }
    await api(`/api/plans/${planId}/submit`, { method: 'POST', body: { version: draft.version } })
  })

  await check('weekly plans: the manager screens fit 360-430 px in ar/en, light and dark', async () => {
    await page.evaluate(`fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })`)
    apiToken = null
    await signIn(page, baseUrl, 'supervisor@demo.local', password)
    await page.waitFor(`location.pathname.startsWith('/admin')`)
    for (const combo of COMBOS) {
      const t = locales[combo.language]
      await reopenAs('/admin/plans', combo)
      await page.waitFor(`document.querySelector('[data-testid=plan-row]')`, 20000)
      for (const width of WIDTHS) {
        await page.viewport(width, 844, true)
        await page.sleep(300)
        assert.ok((await pageOverflow()) <= 1, `/admin/plans fits ${width}px`)
        assert.ok(
          await page.evaluate(`Boolean(document.querySelector('[data-testid=open-filters]'))`),
          'filters in a sheet',
        )
        await shoot(`admin-plans-${combo.language}-${combo.theme}-${width}`)
      }
      await page.viewport(390, 844, true)
      await go(`/admin/plans/${planId}`)
      await page.waitFor(`document.querySelector('[data-testid=plan-return]')`, 20000)
      for (const width of WIDTHS) {
        await page.viewport(width, 844, true)
        await page.sleep(300)
        assert.ok((await pageOverflow()) <= 1, `plan detail fits ${width}px`)
        assert.equal(await reachable(t.plans.review.approve), 'ok')
        assert.equal(await reachable(t.plans.review.return), 'ok')
        await page.evaluate(`window.scrollTo(0, 0)`)
        await shoot(`admin-plan-detail-${combo.language}-${combo.theme}-${width}`)
        await page.click('[data-testid=plan-return]')
        await page.waitFor(`document.querySelector('[data-testid=plan-review-dialog]')`)
        await assertBottomSheet(width)
        await shoot(`admin-plan-return-dialog-${combo.language}-${combo.theme}-${width}`)
        await closeDialog()
      }
      await page.viewport(390, 844, true)
      await go('/admin')
      await page.waitFor(`document.querySelector('[data-testid=dashboard-plans-count]')`, 20000)
      await shoot(`admin-dashboard-${combo.language}-${combo.theme}`)
    }
    await page.evaluate(
      `localStorage.setItem('op.language', 'en'); localStorage.setItem('op.theme', 'light')`,
    )
  })

  assert.deepEqual(
    page.problems.filter(
      (p) => !/Failed to load resource|negotiation|start the connection|^\[error\]/.test(p),
    ),
    [],
  )
  console.log(`# ${passed} checks passed`)
} finally {
  await page.close()
}
