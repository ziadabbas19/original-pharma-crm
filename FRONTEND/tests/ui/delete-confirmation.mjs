/**
 * Every delete asks first. Needs the API and the dev server running with the demo data:
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5173 npm run test:ui
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const password = process.env.UI_TEST_PASSWORD
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')

const page = await launch()
const dialog = `document.querySelector('[data-testid=delete-dialog]')`
const confirmButton = `document.querySelector('[data-testid=delete-confirm]')`

/** Calls the API with the session of the signed-in page. */
const api = (path, options = {}) =>
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
    return response.status === 204 ? null : response.json()
  })()`)

const rowButton = (name, label) => `[...document.querySelectorAll('tr')]
  .find((row) => row.textContent.includes(${JSON.stringify(name)}))
  ?.querySelector('button[aria-label=${JSON.stringify(label)}]')`

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'generated') return []
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

try {
  await page.viewport(1440, 900)

  await check('no screen uses the browser confirm box', async () => {
    const used = sourceFiles('src').filter((file) => /window\.confirm\(/.test(readFileSync(file, 'utf8')))
    assert.deepEqual(used, [])
  })

  await signIn(page, baseUrl, 'admin@originalpharma.local', password)
  const name = `UI check ${Date.now()}`
  const created = await api('/api/lookups/specialties', {
    method: 'POST',
    body: { nameAr: `فحص ${name}`, nameEn: name, isActive: true, sortOrder: 9000 },
  })
  const exists = async () =>
    (await api('/api/lookups/specialties?includeInactive=true')).some((s) => s.id === created.id)

  await check('deleting a lookup opens the dialog and deletes nothing yet', async () => {
    await page.goto(`${baseUrl}/admin/lookups`)
    await page.waitFor(
      `document.body.textContent.includes(${JSON.stringify(name)}) || ${rowButton('Cardiology', 'Delete')}`,
    )
    await page.evaluate(`[...document.querySelectorAll('input[type=search]')][0].focus()`)
    await page.fill('input[type=search]', name)
    await page.waitFor(rowButton(name, 'Delete'))
    await page.evaluate(`${rowButton(name, 'Delete')}.click()`)
    await page.waitFor(dialog)
    await page.waitFor(`${confirmButton} && !${confirmButton}.disabled`)
    assert.ok(
      await page.evaluate(`${dialog}.textContent.includes(${JSON.stringify(name)})`),
      'the dialog names the item',
    )
    assert.equal(await exists(), true)
  })

  await check('cancel closes the dialog and keeps the item', async () => {
    await page.evaluate(
      `[...${dialog}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click()`,
    )
    await page.waitFor(`!${dialog}`)
    assert.equal(await exists(), true)
  })

  await check('confirming deletes the item and shows the result', async () => {
    await page.evaluate(`${rowButton(name, 'Delete')}.click()`)
    await page.waitFor(`${confirmButton} && !${confirmButton}.disabled`)
    await page.evaluate(`${confirmButton}.click()`)
    await page.waitFor(`${dialog} && !${confirmButton}`)
    assert.equal(await exists(), false)
  })

  await check('deleting a user needs the typed word', async () => {
    await page.goto(`${baseUrl}/admin/users`)
    await page.waitFor(rowButton('Demo Rep East', 'Delete'))
    await page.evaluate(`${rowButton('Demo Rep East', 'Delete')}.click()`)
    await page.waitFor(`document.querySelector('[data-testid=delete-confirm-word]')`)
    assert.equal(await page.evaluate(`${confirmButton}.disabled`), true)
    await page.fill('[data-testid=delete-confirm-word]', 'remove')
    await page.sleep(100)
    assert.equal(await page.evaluate(`${confirmButton}.disabled`), true)
    await page.fill('[data-testid=delete-confirm-word]', 'delete')
    await page.waitFor(`!${confirmButton}.disabled`)
    await page.evaluate(
      `[...${dialog}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click()`,
    )
    await page.waitFor(`!${dialog}`)
    const users = await api('/api/users')
    assert.ok(
      users.some((u) => u.fullName === 'Demo Rep East'),
      'cancel keeps the user',
    )
  })

  console.log(`\n${passed} checks passed`)
} finally {
  await page.close()
}
