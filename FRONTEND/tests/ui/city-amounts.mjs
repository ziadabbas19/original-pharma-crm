/**
 * Default daily amounts from the rep app: the section on the rep's Expenses screen is hidden until an
 * admin gives the Rep role expenses:settings; then the rep sees the towns of their own area, changes
 * one in a bottom sheet (with the same amount checks as expense lines), the list follows at once and the
 * change is in the activity log. The grant is taken back at the end. Checked at 360 and 430 px in
 * Arabic and English, light and dark. The admin and the rep have their own browsers (sign-in is rate
 * limited). Changes data: run it against a throwaway database with the demo data.
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:city-amounts
 * UI_CITY_SCREENSHOTS=<folder> saves screenshots of the section and its dialog.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const password = process.env.UI_TEST_PASSWORD
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')
const screenshots = process.env.UI_CITY_SCREENSHOTS

let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

/** Calls the API as the user signed in on `page`. */
const api = (page, path, options = {}) =>
  page.evaluate(`(async () => {
    const auth = await fetch('/api/auth/refresh', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'web' }),
    }).then((r) => r.json())
    const response = await fetch(${JSON.stringify(path)}, {
      method: ${JSON.stringify(options.method ?? 'GET')},
      headers: { Authorization: 'Bearer ' + auth.accessToken, 'Content-Type': 'application/json' },
      body: ${options.body ? JSON.stringify(JSON.stringify(options.body)) : 'undefined'},
    })
    const body = response.status === 204 ? null : await response.json()
    if (!response.ok) throw new Error(response.status + ' ' + JSON.stringify(body))
    return body
  })()`)

const rep = await launch()
const admin = await launch()

/** Opens the rep's expenses screen with a fresh session read (so new permissions apply). */
async function openExpenses({ language = 'en', theme = 'light' } = {}) {
  await rep.evaluate(
    `localStorage.setItem('op.language', '${language}'); localStorage.setItem('op.theme', '${theme}')`,
  )
  await rep.goto(`${baseUrl}/rep/expenses`)
  await rep.waitFor(
    `document.querySelector('[data-testid=monthly-expenses] [data-testid=month-statement]')`,
    20000,
  )
  await rep.sleep(500)
}

const sectionShown = () => rep.evaluate(`Boolean(document.querySelector('[data-testid=city-amounts]'))`)

async function shoot(name) {
  if (!screenshots) return
  mkdirSync(screenshots, { recursive: true })
  await rep.sleep(400)
  writeFileSync(join(screenshots, `${name}.png`), await rep.screenshot())
}

let repRole
let originalGrants
/** Nasr City's amount before the test, put back at the end so other suites find the demo amounts. */
let nasrBefore

try {
  await rep.viewport(390, 844, true)
  await admin.viewport(1280, 900)
  await signIn(rep, baseUrl, 'rep@demo.local', password)
  await rep.waitFor(`location.pathname.startsWith('/rep')`)

  await check('without expenses:settings the rep sees no default amounts', async () => {
    await openExpenses()
    assert.equal(await sectionShown(), false)
  })

  await check('an admin gives the Rep role expenses:settings (own)', async () => {
    await signIn(admin, baseUrl, 'admin@originalpharma.local', password)
    await admin.waitFor(`location.pathname.startsWith('/admin')`)
    repRole = (await api(admin, '/api/roles')).find((r) => r.key === 'Rep')
    originalGrants = repRole.permissions.map((g) => ({ key: g.key, scope: g.scope }))
    assert.ok(!originalGrants.some((g) => g.key === 'expenses:settings'), 'not a default of the Rep role')
    await api(admin, `/api/roles/${repRole.id}/permissions`, {
      method: 'PUT',
      body: { permissions: [...originalGrants, { key: 'expenses:settings', scope: 'own' }] },
    })
  })

  await check('the rep sees the towns of their own area with the note about new lines', async () => {
    nasrBefore = (await api(rep, '/api/territories/expense-defaults')).find((t) => t.name === 'Nasr City')
    await openExpenses()
    await rep.waitFor(`document.querySelector('[data-testid=city-amount]')`, 20000)
    const names = await rep.evaluate(
      `[...document.querySelectorAll('[data-testid=city-amount-name]')].map((n) => n.textContent)`,
    )
    assert.ok(names.includes('Nasr City'), JSON.stringify(names))
    for (const outside of ['Dokki', 'Mohandessin', 'Smouha']) assert.ok(!names.includes(outside), outside)
    assert.ok(
      (await rep.evaluate(`document.querySelector('[data-testid=city-amounts-note]').textContent`)).includes(
        'new automatic lines only',
      ),
    )
  })

  await check(
    'the amount is changed in a bottom sheet, checked like expense lines, and shows at once',
    async () => {
      const row = `[...document.querySelectorAll('[data-testid=city-amount]')].find((r) => r.textContent.includes('Nasr City'))`
      await rep.evaluate(`${row}.querySelector('[data-testid=city-amount-edit]').click()`)
      await rep.waitFor(`document.querySelector('[data-testid=city-expense-dialog]')`)
      const sheet = await rep.evaluate(
        `(() => { const r = document.querySelector('[role=dialog]').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom } })()`,
      )
      assert.ok(sheet.left <= 1 && sheet.right >= 389 && sheet.bottom >= 843, 'bottom sheet')
      await rep.fill('[data-testid=city-expense-amount]', '12.345')
      await rep.waitFor(`document.querySelector('[data-testid=city-expense-invalid]')`)
      assert.ok(await rep.evaluate(`document.querySelector('[data-testid=city-expense-save]').disabled`))
      await rep.fill('[data-testid=city-expense-amount]', '72.50')
      await rep.click('[data-testid=city-expense-save]')
      await rep.waitFor(`!document.querySelector('[data-testid=city-expense-dialog]')`, 20000)
      await rep.waitFor(
        `${row}.querySelector('[data-testid=city-amount-value]').textContent.includes('72.50')`,
        20000,
      )

      const nasr = (await api(rep, '/api/territories/expense-defaults')).find((t) => t.name === 'Nasr City')
      assert.equal(nasr.defaultDailyExpense, 72.5)
      const log = await api(admin, `/api/audit?EntityType=territory&EntityId=${nasr.id}`)
      const entry = log.find((e) => e.actorName === 'Demo Rep' && e.action === 'updated')
      assert.ok(entry, 'logged with the rep as the actor')
      assert.equal(entry.details.after.defaultDailyExpense, 72.5)
      assert.ok(entry.details.before.defaultDailyExpense !== undefined)
    },
  )

  await check('the section fits 360-430 px in Arabic and English, light and dark', async () => {
    for (const language of ['ar', 'en']) {
      for (const theme of ['light', 'dark']) {
        await openExpenses({ language, theme })
        await rep.waitFor(`document.querySelector('[data-testid=city-amount]')`, 20000)
        for (const width of [360, 430]) {
          await rep.viewport(width, 844, true)
          await rep.sleep(300)
          const overflow = await rep.evaluate(`document.documentElement.scrollWidth - window.innerWidth`)
          assert.ok(overflow <= 1, `scrolls sideways by ${overflow}px at ${width}px (${language}, ${theme})`)
          const target = await rep.evaluate(
            `document.querySelector('[data-testid=city-amount-edit]').getBoundingClientRect().height`,
          )
          assert.ok(target >= 44, `edit button is ${target}px high`)
          await rep.evaluate(
            `document.querySelector('[data-testid=city-amounts]').scrollIntoView({ block: 'start' })`,
          )
          await shoot(`rep-city-amounts-${language}-${theme}-${width}`)
          await rep.click('[data-testid=city-amount-edit]')
          await rep.waitFor(`document.querySelector('[data-testid=city-expense-dialog]')`)
          await shoot(`rep-city-amount-dialog-${language}-${theme}-${width}`)
          await rep.click('[role=dialog] [data-slot=dialog-close]')
          await rep.waitFor(`!document.querySelector('[role=dialog]')`)
        }
      }
    }
    await rep.viewport(390, 844, true)
  })

  await check('taking the permission back hides the section again', async () => {
    await api(admin, `/api/roles/${repRole.id}/permissions`, {
      method: 'PUT',
      body: { permissions: originalGrants },
    })
    repRole = null
    await openExpenses()
    assert.equal(await sectionShown(), false)
  })

  for (const page of [rep, admin]) {
    assert.deepEqual(
      page.problems.filter((p) => !/Failed to load resource|negotiation|start the connection/.test(p)),
      [],
    )
  }
  console.log(`# ${passed} checks passed`)
} finally {
  // Leave the amount and the Rep role as they were for the other suites, even after a failure.
  if (nasrBefore) {
    await api(admin, `/api/territories/${nasrBefore.id}/expense-default`, {
      method: 'PUT',
      body: { defaultDailyExpense: nasrBefore.defaultDailyExpense ?? 0 },
    }).catch(() => {})
  }
  if (repRole && originalGrants) {
    await api(admin, `/api/roles/${repRole.id}/permissions`, {
      method: 'PUT',
      body: { permissions: originalGrants },
    }).catch(() => {})
  }
  await rep
    .evaluate(`localStorage.setItem('op.language', 'en'); localStorage.setItem('op.theme', 'light')`)
    .catch(() => {})
  await rep.close()
  await admin.close()
}
