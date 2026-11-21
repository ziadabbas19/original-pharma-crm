/**
 * Error display in the real app with a fake API (no backend needed): the error state of a list,
 * server field errors on a form, the toast of a failed action and the not-found screen.
 *   UI_TEST_URL=http://localhost:5173 npm run test:ui:errors
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { launch } from './browser.mjs'
import { mockSession } from './mock-api.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const en = JSON.parse(readFileSync(new URL('../../src/lib/i18n/locales/en.json', import.meta.url), 'utf8'))
const ar = JSON.parse(readFileSync(new URL('../../src/lib/i18n/locales/ar.json', import.meta.url), 'utf8'))

const ROLE = {
  id: '00000000-0000-0000-0000-0000000000r1',
  key: 'Rep',
  nameAr: 'مندوب طبي',
  nameEn: 'Medical rep',
  description: null,
  isSystem: true,
  level: 40,
  permissionsLocked: false,
  userCount: 0,
  permissions: [],
}

let usersFail = true
let createReply = null
let markAllReply = null

const page = await launch()
const text = (selector) =>
  page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`)
const has = (selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)

let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

async function open(path, language = 'en') {
  await page.goto(`${baseUrl}/login`)
  await page.evaluate(
    `localStorage.setItem('op.language', '${language}'); localStorage.setItem('op.theme', 'light')`,
  )
  await page.goto(`${baseUrl}${path}`)
}

try {
  await page.viewport(1280, 900)
  await page.mockApi(
    mockSession({
      routes: {
        // Fails until the test lets it through (the query retries twice on its own first).
        'GET /api/users': () =>
          usersFail
            ? {
                status: 500,
                body: {
                  code: 'server-error',
                  title: 'System.NullReferenceException at UsersController',
                  traceId: 'trace-123',
                },
              }
            : { body: [] },
        'GET /api/roles': { body: [ROLE] },
        'POST /api/users': () => createReply,
        'POST /api/notifications/read-all': () => markAllReply,
      },
    }),
  )

  await check('a failed list shows the localized server message, the reference and a retry', async () => {
    await open('/admin/users')
    await page.waitFor(`document.querySelector('[data-testid=error-state]')`, 20000)
    const body = await text('[data-testid=error-state]')
    assert.ok(body.includes(en.errors.kind.server), body)
    assert.ok(body.includes('Reference: trace-123'), body)
    assert.ok(!body.includes('NullReferenceException'), 'raw server text is never shown')
    // No cached data to fall back on: the failure is also toasted, once.
    await page.waitFor(`document.querySelectorAll('[data-testid=toast]').length === 1`)
    usersFail = false
    await page.evaluate(
      `[...document.querySelectorAll('[data-testid=error-state] button')].find((b) => b.textContent.includes(${JSON.stringify(en.common.retry)})).click()`,
    )
    await page.waitFor(`!document.querySelector('[data-testid=error-state]')`)
  })

  await check('server field errors appear under their fields, without a form error', async () => {
    createReply = {
      status: 400,
      body: {
        code: 'validation',
        title: 'One or more fields are invalid.',
        errors: { Email: ['This email is already in use.'] },
      },
    }
    await page.evaluate(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(en.users.create.title)})).click()`,
    )
    await page.waitFor(`document.querySelector('input[type=email]')`)
    await page.fill('input[name=fullName], #fullName', 'New Person')
    await page.fill('input[type=email]', 'taken@example.test')
    await page.click(`#new-user-role-${ROLE.id}`)
    await page.sleep(100)
    await page.evaluate(`document.querySelector('[role=dialog] button[type=submit]').click()`)
    await page.waitFor(
      `document.querySelector('[role=dialog]').textContent.includes('This email is already in use.')`,
    )
    assert.equal(await has('[role=dialog] [data-testid=form-error]'), false)
  })

  await check('an error that fits no field is shown above the buttons', async () => {
    createReply = { status: 422, body: { code: 'user-create-failed', title: 'Passwords must have a digit.' } }
    await page.evaluate(`document.querySelector('[role=dialog] button[type=submit]').click()`)
    await page.waitFor(`document.querySelector('[role=dialog] [data-testid=form-error]')`)
    const message = await text('[role=dialog] [data-testid=form-error]')
    assert.ok(message.includes('The user could not be created'), message)
    assert.ok(
      !(await page.evaluate(
        `document.querySelector('[role=dialog]').textContent.includes('This email is already in use.')`,
      )),
      'old field error cleared',
    )
  })

  await check('a refused action shows one permission toast, in Arabic too', async () => {
    markAllReply = {
      status: 403,
      body: { code: 'forbidden', title: 'You do not have access to this resource.', traceId: 't' },
    }
    await open('/admin/notifications', 'ar')
    await page.waitFor(`document.querySelector('main button')`)
    const markAll = `[...document.querySelectorAll('main button')].find((b) => b.textContent.includes(${JSON.stringify(ar.notifications.markAllRead)}))`
    await page.evaluate(`${markAll}.click()`)
    await page.evaluate(`${markAll}.click()`)
    await page.waitFor(`document.querySelector('[data-testid=toast]')`)
    await page.sleep(300)
    const toasts = await page.evaluate(
      `[...document.querySelectorAll('[data-testid=toast]')].map((t) => t.textContent)`,
    )
    assert.equal(toasts.length, 1, JSON.stringify(toasts))
    assert.ok(toasts[0].includes(ar.errors.kind.forbidden), toasts[0])
    assert.equal(await page.evaluate(`location.pathname`), '/admin/notifications', '403 never redirects')
  })

  await check('an unknown address shows the not-found screen with a way home', async () => {
    await open('/no-such-page')
    await page.waitFor(`document.querySelector('[data-testid=error-screen]')`)
    const body = await text('[data-testid=error-screen]')
    assert.ok(body.includes(en.errors.page.notFoundTitle), body)
    assert.ok(
      await page.evaluate(`Boolean(document.querySelector('[data-testid=error-screen] a[href="/"]'))`),
    )
  })

  assert.deepEqual(
    // The live connection (SignalR) has no server in this test; the logged request failures are expected.
    page.problems.filter(
      (p) => !/Failed to load resource|negotiation|start the connection|^\[error\]/.test(p),
    ),
    [],
    'no unexpected console errors',
  )
  console.log(`# ${passed} checks passed`)
} finally {
  await page.close()
}
