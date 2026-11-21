/**
 * A rep's day and month expenses on a phone (390 x 844): a visit yesterday adds the city's daily
 * expense; the rep picks yesterday, sees the visit and the line, changes the amount, writes a day
 * note, and the month total follows on the Visits screen and the monthly screen. Then the manager's
 * expense screen at phone size. Changes data: run it against a throwaway database with the demo data.
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:expenses
 */
import assert from 'node:assert/strict'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5173'
const password = process.env.UI_TEST_PASSWORD
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')

const page = await launch()
let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

const text = (testId) => page.evaluate(`document.querySelector('[data-testid=${testId}]')?.textContent ?? ''`)
/** "EGP 1,234.50" / "‏1,234.50 ج.م.‏" -> 1234.5 */
const amountIn = async (testId) => Number((await text(testId)).replace(/[^\d.]/g, ''))

/** Calls the API as the signed-in user. */
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
    const body = response.status === 204 ? null : await response.json()
    if (!response.ok) throw new Error(response.status + ' ' + JSON.stringify(body))
    return body
  })()`)

const nav = async (path) => {
  await page.evaluate(
    `window.history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate'))`,
  )
  await page.sleep(400)
}

/** The Egypt day of an instant, as the app counts it. */
const egyptDay = (ms) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms)

try {
  await page.viewport(390, 844, true)
  await signIn(page, baseUrl, 'rep@demo.local', password)
  await page.waitFor(`location.pathname.startsWith('/rep')`)

  const yesterday = egyptDay(Date.now() - 86_400_000)
  let doctor
  let cityAmount
  let lineAmount

  await check('a visit yesterday adds the city of the doctor to the day expenses', async () => {
    const [doctors, towns] = await Promise.all([api('/api/doctors?Mine=true'), api('/api/lookups/towns')])
    const amounts = new Map(towns.map((t) => [t.id, t.defaultDailyExpense]))
    doctor =
      doctors.find((d) => d.location && amounts.get(d.townId) > 0) ??
      doctors.find((d) => amounts.get(d.townId) > 0)
    assert.ok(doctor, 'a doctor on the list in a town with a daily expense')
    cityAmount = amounts.get(doctor.townId)
    // 10:00 Cairo time yesterday (winter or summer time, either way inside the day).
    const at = new Date(`${yesterday}T07:30:00Z`).toISOString()
    const lat = doctor.location?.lat ?? 30.0561
    const lng = doctor.location?.lng ?? 31.3301
    const visit = await api('/api/visits/check-in', {
      method: 'POST',
      body: {
        customerId: doctor.id,
        deviceId: 'ui-expenses',
        lat,
        lng,
        accuracy: 10,
        timestamp: at,
        clientRequestId: crypto.randomUUID(),
      },
    })
    await api(`/api/visits/${visit.id}/check-out`, {
      method: 'POST',
      body: {
        lat,
        lng,
        accuracy: 10,
        timestamp: new Date(Date.parse(at) + 20 * 60_000).toISOString(),
        clientRequestId: crypto.randomUUID(),
      },
    })
  })

  await check('the rep picks yesterday and sees the visit, its area and the automatic line', async () => {
    await nav('/rep/visits')
    await page.waitFor(`document.querySelector('[data-testid=day-picker]')`, 20000)
    await page.click('[data-testid=day-previous]')
    await page.waitFor(`location.search.includes(${JSON.stringify(yesterday)})`)
    await page.waitFor(`document.querySelector('[data-testid=visit-list]')?.textContent.length > 0`, 20000)
    assert.ok(
      await page.evaluate(`Boolean(document.querySelector('[data-testid=visit-time]'))`),
      'visit time shown',
    )
    assert.ok(
      await page.evaluate(`Boolean(document.querySelector('[data-testid=visit-area]'))`),
      'visit area shown',
    )
    await page.waitFor(`document.querySelector('[data-testid=expense-line]')`, 20000)
    // The automatic line of the doctor's town, created from its default amount (a re-run may find it changed).
    const day = await api(`/api/expenses/day?day=${yesterday}`)
    const line = day.lines.find((l) => l.cityId === doctor.townId)
    assert.ok(line, 'the town has a line')
    assert.equal(line.originalAmount, cityAmount)
    lineAmount = line.amount
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth - window.innerWidth <= 1`), true)
  })

  await check('editing the amount keeps the default visible and moves the month total', async () => {
    const before = await amountIn('day-month-total')
    const monthBefore = await amountIn('month-expenses-total')
    assert.equal(before, monthBefore)
    await page.click('[data-testid=expense-line]')
    await page.waitFor(`document.querySelector('#expense-amount')`)
    const edited = lineAmount + 25
    await page.fill('#expense-amount', String(edited))
    await page.fill('#expense-note', 'Taxi from the station')
    await page.click('[data-testid=expense-save]')
    await page.waitFor(`!document.querySelector('[data-testid=expense-dialog]')`)
    await page.waitFor(`document.querySelector('[data-testid=expense-edited]')`)
    await page.waitFor(`!document.querySelector('[data-testid=expense-queued]')`, 20000)
    assert.equal(await amountIn('day-month-total'), Math.round((before + 25) * 100) / 100)
    await page.waitFor(
      `Number(document.querySelector('[data-testid=month-expenses-total]').textContent.replace(/[^\\d.]/g, '')) === ${Math.round((monthBefore + 25) * 100) / 100}`,
    )
    assert.ok((await text('day-expenses')).includes('Taxi from the station'))
  })

  await check('a day note is written and kept', async () => {
    await page.click('[data-testid=day-note-edit]')
    await page.waitFor(`document.querySelector('#day-note-input')`)
    await page.fill('#day-note-input', 'Two towns, train back')
    await page.click('[data-testid=day-note-save]')
    await page.waitFor(
      `(document.querySelector('[data-testid=day-note]')?.textContent ?? '').includes('Two towns, train back')`,
    )
    // The note goes through the phone's outbox; it reaches the server within moments.
    let saved = null
    for (let i = 0; i < 20 && saved !== 'Two towns, train back'; i++) {
      saved = (await api(`/api/expenses/day?day=${yesterday}`)).note
      if (saved !== 'Two towns, train back') await page.sleep(300)
    }
    assert.equal(saved, 'Two towns, train back')
  })

  await check('the monthly screen shows the same total, the day and its note', async () => {
    const month = await amountIn('month-expenses-total')
    await page.click('[data-testid=month-expenses-link]')
    await page.waitFor(`document.querySelector('[data-testid=statement-total]')`, 20000)
    assert.equal(await amountIn('statement-total'), month)
    assert.ok(await page.evaluate(`document.querySelectorAll('[data-testid=statement-day]').length >= 1`))
    await page.click('[data-testid=month-previous]')
    await page.waitFor(`document.querySelector('[data-testid=month-current]')`)
    await page.click('[data-testid=month-current]')
    await page.waitFor(`!document.querySelector('[data-testid=month-current]')`)
  })

  await check('the supervisor sees the rep in the month view of the expense screen on a phone', async () => {
    await page.evaluate(`fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })`)
    await signIn(page, baseUrl, 'supervisor@demo.local', password)
    await page.waitFor(`location.pathname.startsWith('/admin')`)
    await nav('/admin/expenses?view=month')
    await page.waitFor(`document.querySelector('[data-testid=month-totals-rep]')`, 20000)
    assert.ok((await text('month-totals-rep')).includes('Demo Rep'))
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth - window.innerWidth <= 1`), true)
    await page.evaluate(
      `[...document.querySelectorAll('[data-testid=month-totals-rep] button')].find((b) => b.textContent.includes('Demo Rep')).click()`,
    )
    await page.waitFor(`document.querySelector('[data-testid=rep-statement]')`)
    assert.ok((await text('rep-statement')).includes('Taxi from the station'))
  })

  assert.deepEqual(
    page.problems.filter((p) => !/Failed to load resource|negotiation|start the connection/.test(p)),
    [],
  )
  console.log(`# ${passed} checks passed`)
} finally {
  await page.close()
}
