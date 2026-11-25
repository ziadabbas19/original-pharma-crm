/**
 * Private notes with a reminder on the phone (390 x 844, Arabic): the rep writes a note with a reminder
 * two hours ahead (notify 15 minutes before) from Account > Notes, sees it in the Reminders card on Home,
 * snoozes it 10 minutes there and marks it done; the server has each change. Changes data: run it against
 * a throwaway database with the demo data.
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:notes
 * Screenshots go to UI_SCREENSHOTS when it is set.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { egyptDayAndTime } from '../../src/features/notes/note-time.ts'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const password = process.env.UI_TEST_PASSWORD
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')
const shots = process.env.UI_SCREENSHOTS

let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

/** Calls the API as the user signed in on `page`. */
const api = (page, path) =>
  page.evaluate(`(async () => {
    const auth = await fetch('/api/auth/refresh', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'web' }),
    }).then((r) => r.json())
    const response = await fetch(${JSON.stringify(path)}, { headers: { Authorization: 'Bearer ' + auth.accessToken } })
    const body = await response.json()
    if (!response.ok) throw new Error(response.status + ' ' + JSON.stringify(body))
    return body
  })()`)

const page = await launch()
const title = `مكالمة د. هاني ${Date.now() % 100000}`
const MIN = 60_000

async function shot(name) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  writeFileSync(join(shots, `${name}.png`), await page.screenshot())
}

/** The server's copy of the test note (after the outbox sent the last change). */
async function serverNote(predicate, label) {
  const end = Date.now() + 20_000
  while (Date.now() < end) {
    const notes = await api(page, '/api/notes?status=all')
    const found = notes.find((n) => n.title === title)
    if (found && predicate(found)) return found
    await page.sleep(400)
  }
  throw new Error(`The server never showed: ${label}`)
}

const homeRow = `[...document.querySelectorAll('[data-testid=home-reminder]')].find((li) => li.textContent.includes(${JSON.stringify(title)}))`

try {
  await page.viewport(390, 844, true)
  await signIn(page, baseUrl, 'rep@demo.local', password, { language: 'ar' })
  await page.waitFor(`location.pathname.startsWith('/rep')`, 20000)

  await check('Account lists Notes, which opens the notes screen in Arabic', async () => {
    await page.goto(`${baseUrl}/rep/settings`)
    await page.waitFor(`document.querySelector('[data-testid=account-menu] a[href="/rep/notes"]')`, 20000)
    await page.click('[data-testid=account-menu] a[href="/rep/notes"]')
    await page.waitFor(`document.querySelector('[data-testid=notes-page]')`, 20000)
    assert.equal(await page.evaluate(`document.documentElement.dir`), 'rtl')
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid=notes-page] h1').textContent`),
      'الملاحظات',
    )
  })

  const remindAt = Date.now() + 2 * 60 * MIN
  const { day, time } = egyptDayAndTime(remindAt)

  await check('a note with a reminder two hours ahead, notified 15 minutes before, is saved', async () => {
    await page.click('[data-testid=note-new]')
    await page.waitFor(`document.querySelector('[data-testid=note-sheet]')`)
    await page.fill('[data-testid=note-title]', title)
    await page.fill('[data-testid=note-body]', 'اسأل عن العينات والموعد القادم')
    await page.click('[data-testid=note-remind]')
    await page.waitFor(`document.querySelector('[data-testid=note-day]')`)
    await page.fill('[data-testid=note-day]', day)
    await page.fill('[data-testid=note-time]', time)
    await page.evaluate(`(() => {
      const select = document.querySelector('[data-testid=note-before]')
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '15')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await page.waitFor(`document.querySelector('[data-testid=note-notify-at]')`)
    await shot('notes-sheet-ar')
    await page.click('[data-testid=note-save]')
    await page.waitFor(`!document.querySelector('[data-testid=note-sheet]')`)
    await page.waitFor(
      `[...document.querySelectorAll('[data-testid=note-item]')].some((c) => c.textContent.includes(${JSON.stringify(title)}))`,
    )

    const saved = await serverNote(() => true, 'the new note')
    const expected = new Date(Math.floor(remindAt / MIN) * MIN)
    assert.equal(new Date(saved.remindAt).getTime(), expected.getTime())
    assert.equal(saved.remindBeforeMinutes, 15)
    assert.equal(new Date(saved.notifyAt).getTime(), expected.getTime() - 15 * MIN)
    assert.equal(saved.doneAt, null)
    await shot('notes-list-ar')
  })

  await check('Home shows it in the Reminders card as upcoming', async () => {
    await page.click('[data-testid=nav-home]')
    await page.waitFor(`document.querySelector('[data-testid=home-reminders]')`, 20000)
    await page.waitFor(`${homeRow}`)
    assert.equal(await page.evaluate(`${homeRow}.dataset.state`), 'upcoming')
    // Nothing on Home runs past the phone's width (long card text included).
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`))
    await page.evaluate(
      `document.querySelector('[data-testid=home-reminders]').scrollIntoView({ block: 'center', behavior: 'instant' })`,
    )
    await page.sleep(300)
    await shot('home-reminders-ar')
  })

  await check(
    'Snooze 10 minutes from Home moves the reminder to now + 10, notified at that time',
    async () => {
      const before = Date.now()
      await page.evaluate(`${homeRow}.querySelector('[data-testid=note-snooze]').click()`)
      await page.waitFor(`${homeRow}.querySelector('[data-testid=snooze-10m]')`)
      await page.evaluate(`${homeRow}.querySelector('[data-testid=snooze-10m]').click()`)
      const snoozed = await serverNote((n) => n.remindBeforeMinutes === 0, 'the snoozed reminder')
      const at = new Date(snoozed.remindAt).getTime()
      assert.ok(at >= before + 9 * MIN && at <= Date.now() + 11 * MIN, `snoozed to ${snoozed.remindAt}`)
      assert.equal(snoozed.notifyAt && new Date(snoozed.notifyAt).getTime(), at)
      assert.equal(snoozed.notifiedAt, null)
      await page.waitFor(`${homeRow} && ${homeRow}.dataset.state === 'upcoming'`)
    },
  )

  await check('Done from Home takes it off the card and into the Done tab', async () => {
    await page.evaluate(`${homeRow}.querySelector('[data-testid=note-done]').click()`)
    await page.waitFor(`!(${homeRow})`)
    const done = await serverNote((n) => n.doneAt !== null, 'the done note')
    assert.ok(done.doneAt)

    await page.goto(`${baseUrl}/rep/notes`)
    await page.waitFor(`document.querySelector('[data-testid=notes-page]')`, 20000)
    await page.click('[data-testid=notes-tab-done]')
    await page.waitFor(
      `[...document.querySelectorAll('[data-testid=note-item]')].some((c) => c.textContent.includes(${JSON.stringify(title)}))`,
    )
    await page.click('[data-testid=notes-tab-open]')
    await page.waitFor(
      `![...document.querySelectorAll('[data-testid=note-item]')].some((c) => c.textContent.includes(${JSON.stringify(title)}))`,
    )
  })

  assert.deepEqual(
    page.problems.filter((p) => !/Failed to load resource|ERR_|favicon|negotiat|WebSocket/i.test(p)),
    [],
    'no console errors',
  )
  console.log(`\n${passed} checks passed`)
} finally {
  await page.close()
}
