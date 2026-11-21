/**
 * A rep adds a pharmacy from the phone (390 x 844): "Add pharmacy" on the Pharmacies tab opens a bottom
 * sheet with the towns of the rep's own area; the new pharmacy is in the list at once and can be
 * visited; the same name in the same town offers the existing pharmacy instead. When an admin takes
 * customers:create-pharmacy away from the Rep role the button is gone (given back at the end). The admin
 * and the rep have their own browsers (sign-in is rate limited). Changes data: run it against a
 * throwaway database with the demo data.
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:pharmacy
 */
import assert from 'node:assert/strict'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const password = process.env.UI_TEST_PASSWORD
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')

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
const name = `Ui Pharmacy ${Date.now() % 100000}`

/** The rep's Pharmacies tab, read fresh from the server (so changed permissions apply). */
async function openPharmacies() {
  await rep.goto(`${baseUrl}/rep/doctors`)
  await rep.waitFor(`document.querySelector('[data-testid=tab-pharmacies]')`, 20000)
  await rep.click('[data-testid=tab-pharmacies]')
  // The list is loaded (the loading state is skeletons) before anything is read from it.
  await rep.waitFor(
    `!document.querySelector('main [role=status]') && document.querySelector('main ul li')`,
    20000,
  )
  await rep.sleep(400)
}

const listNames = () =>
  rep.evaluate(`[...document.querySelectorAll('main ul li a p:first-child')].map((p) => p.textContent)`)

async function fillAndSave(townName) {
  await rep.fill('#pharmacy-new-name', name)
  await rep.fill('#pharmacy-new-address', '12 Abbas El Akkad')
  await rep.fill('#pharmacy-new-phone', '0222223333')
  await rep.evaluate(`(() => {
    const select = document.querySelector('#pharmacy-new-town')
    select.value = [...select.options].find((o) => o.textContent === ${JSON.stringify(townName)}).value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await rep.click('[data-testid=add-pharmacy-save]')
}

let repRole
let originalGrants

try {
  await rep.viewport(390, 844, true)
  await admin.viewport(1280, 900)
  await signIn(rep, baseUrl, 'rep@demo.local', password)
  await rep.waitFor(`location.pathname.startsWith('/rep')`)

  await check('the rep has "Add pharmacy" on the Pharmacies tab', async () => {
    await openPharmacies()
    assert.ok(await rep.evaluate(`Boolean(document.querySelector('[data-testid=add-pharmacy]'))`))
  })

  await check("the sheet is a bottom sheet with only the towns of the rep's area", async () => {
    await rep.click('[data-testid=add-pharmacy]')
    await rep.waitFor(
      `document.querySelector('[data-testid=add-pharmacy-sheet] #pharmacy-new-town optgroup')`,
      20000,
    )
    const sheet = await rep.evaluate(
      `(() => { const r = document.querySelector('[data-testid=add-pharmacy-sheet]').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom } })()`,
    )
    assert.ok(sheet.left <= 1 && sheet.right >= 389 && sheet.bottom >= 843, 'bottom sheet')
    const towns = await rep.evaluate(
      `[...document.querySelectorAll('#pharmacy-new-town optgroup option')].map((o) => o.textContent)`,
    )
    assert.ok(towns.includes('Nasr City'), JSON.stringify(towns))
    for (const outside of ['Dokki', 'Mohandessin', 'Smouha']) assert.ok(!towns.includes(outside), outside)
    assert.ok(
      await rep.evaluate(`Boolean(document.querySelector('[data-testid=new-pharmacy-location-hint]'))`),
    )
    // Nothing filled in: the name is required.
    await rep.click('[data-testid=add-pharmacy-save]')
    await rep.waitFor(`document.querySelector('#pharmacy-new-name[aria-invalid=true]')`)
  })

  await check('the new pharmacy is in the list at once and can be visited', async () => {
    await fillAndSave('Nasr City')
    await rep.waitFor(`!document.querySelector('[data-testid=add-pharmacy-sheet]')`, 20000)
    await rep.waitFor(
      `[...document.querySelectorAll('main ul li')].some((li) => li.textContent.includes(${JSON.stringify(name)}))`,
    )
    assert.ok(
      await rep.evaluate(
        `[...document.querySelectorAll('main ul li')].find((li) => li.textContent.includes(${JSON.stringify(name)})).querySelector('button')?.textContent.length > 0`,
      ),
      'with its start-visit button',
    )
    const created = (await api(rep, '/api/customers?type=pharmacy')).find((c) => c.name === name)
    assert.equal(created.address, '12 Abbas El Akkad')
    assert.equal(created.lat, null, 'no location until the first visit')
    assert.ok((await listNames()).includes(name))
  })

  await check('the same name in the same town offers the existing pharmacy', async () => {
    await rep.click('[data-testid=add-pharmacy]')
    await rep.waitFor(`document.querySelector('#pharmacy-new-town optgroup')`, 20000)
    await fillAndSave('Nasr City')
    await rep.waitFor(`document.querySelector('[data-testid=pharmacy-exists]')`, 20000)
    await rep.evaluate(`document.querySelector('[data-testid=pharmacy-exists] a').click()`)
    await rep.waitFor(`location.pathname.startsWith('/rep/customers/')`)
    await rep.waitFor(`document.querySelector('main').textContent.includes(${JSON.stringify(name)})`, 20000)
  })

  await check('the activity log names the rep as the creator', async () => {
    await signIn(admin, baseUrl, 'admin@originalpharma.local', password)
    await admin.waitFor(`location.pathname.startsWith('/admin')`)
    const created = (await api(admin, '/api/customers?type=pharmacy')).find((c) => c.name === name)
    const log = await api(admin, `/api/audit?EntityType=customer&EntityId=${created.id}`)
    const entry = log.find((e) => e.action === 'created')
    assert.ok(entry, 'created entry')
    assert.equal(entry.actorName, 'Demo Rep')
  })

  await check('without customers:create-pharmacy the button is gone', async () => {
    repRole = (await api(admin, '/api/roles')).find((r) => r.key === 'Rep')
    originalGrants = repRole.permissions.map((g) => ({ key: g.key, scope: g.scope }))
    assert.ok(originalGrants.some((g) => g.key === 'customers:create-pharmacy' && g.scope === 'own'))
    await api(admin, `/api/roles/${repRole.id}/permissions`, {
      method: 'PUT',
      body: { permissions: originalGrants.filter((g) => g.key !== 'customers:create-pharmacy') },
    })
    await openPharmacies()
    assert.equal(await rep.evaluate(`Boolean(document.querySelector('[data-testid=add-pharmacy]'))`), false)
    assert.ok((await listNames()).includes(name), 'the list itself is unchanged')
    await api(admin, `/api/roles/${repRole.id}/permissions`, {
      method: 'PUT',
      body: { permissions: originalGrants },
    })
    repRole = null
  })

  for (const page of [rep, admin]) {
    assert.deepEqual(
      page.problems.filter((p) => !/Failed to load resource|negotiation|start the connection/.test(p)),
      [],
    )
  }
  console.log(`# ${passed} checks passed`)
} finally {
  // Leave the Rep role as it was for the other suites, even after a failure.
  if (repRole && originalGrants) {
    await api(admin, `/api/roles/${repRole.id}/permissions`, {
      method: 'PUT',
      body: { permissions: originalGrants },
    }).catch(() => {})
  }
  await rep.close()
  await admin.close()
}
