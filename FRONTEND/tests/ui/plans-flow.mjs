/**
 * Weekly plans on a phone (390 x 844): the rep plans today from Home, picks a customer, sends the plan;
 * the supervisor finds it on the dashboard, returns it (the note is required) and the rep reads the
 * note, changes the day (read-only while offline) and sends it again; the supervisor approves it and
 * the plan is locked for the rep. The rep and the supervisor each have their own browser, so nobody
 * signs in twice (sign-in is rate limited). Changes data: run it against a throwaway database with the
 * demo data.
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:plans
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

/** Helpers bound to one person's browser. */
function person(page) {
  return {
    page,
    text: (selector) =>
      page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`),
    exists: (selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    async noSideScroll() {
      assert.ok(
        await page.evaluate(`document.documentElement.scrollWidth - window.innerWidth <= 1`),
        'no sideways scroll',
      )
    },
    /** In-app navigation (no reload). */
    async nav(path) {
      await page.evaluate(
        `window.history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate'))`,
      )
      await page.sleep(400)
    },
    /** A full reload, so the screen reads the server again (one session refresh). */
    async reload(path) {
      await page.goto(`${baseUrl}${path}`)
    },
  }
}

/** The Egypt day the app counts as today. */
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(Date.now())
const todayCard = `[data-testid=plan-day][data-day="${today}"]`

const repPage = await launch()
const bossPage = await launch()
const rep = person(repPage)
const boss = person(bossPage)

try {
  await repPage.viewport(390, 844, true)
  await bossPage.viewport(390, 844, true)
  await signIn(repPage, baseUrl, 'rep@demo.local', password)
  await repPage.waitFor(`location.pathname.startsWith('/rep')`)

  await check("Home shows this week's plan and opens it", async () => {
    await repPage.waitFor(`document.querySelector('[data-testid=home-week-plan]')`, 20000)
    await repPage.click('[data-testid=home-week-plan]')
    await repPage.waitFor(`location.pathname === '/rep/plans'`)
    await repPage.waitFor(`document.querySelectorAll('[data-testid=plan-day]').length === 7`, 20000)
    assert.ok(await rep.exists('[data-testid=week-navigator]'))
    assert.ok(await rep.exists('[data-testid=plan-goes-to]'), 'the reviewer is named')
    await rep.noSideScroll()
  })

  await check('the week navigator moves a week and comes back', async () => {
    const label = await rep.text('[data-testid=week-label]')
    await repPage.click('[data-testid=week-next]')
    await repPage.waitFor(`document.querySelector('[data-testid=week-current]')`)
    await repPage.waitFor(
      `document.querySelector('[data-testid=week-label]').textContent !== ${JSON.stringify(label)}`,
    )
    await repPage.click('[data-testid=week-current]')
    await repPage.waitFor(`!document.querySelector('[data-testid=week-current]')`)
    await repPage.waitFor(`document.querySelector(${JSON.stringify(todayCard)})`, 20000)
  })

  await check('the rep plans today: city, target, a customer of that city', async () => {
    await repPage.click(`${todayCard} [data-testid=plan-day-add]`)
    await repPage.waitFor(`document.querySelector('[data-testid=plan-day-dialog] #plan-city')`)
    const dialog = await repPage.evaluate(
      `(() => { const r = document.querySelector('[role=dialog]').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom } })()`,
    )
    assert.ok(dialog.left <= 1 && dialog.right >= 389 && dialog.bottom >= 843, 'bottom sheet')
    await repPage.evaluate(`(() => {
      const select = document.querySelector('#plan-city')
      select.value = [...select.options].find((o) => o.textContent === 'Nasr City').value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await repPage.waitFor(`document.querySelector('[data-testid=plan-customer-option]')`, 20000)
    for (let i = 0; i < 3; i++) await repPage.click('[data-testid=plan-target-more]')
    assert.equal(await repPage.evaluate(`document.querySelector('#plan-target').value`), '3')
    await repPage.fill('#plan-target', '5')
    await repPage.fill('#plan-note', 'Clinics in the morning')
    await repPage.click('[data-testid=plan-customer-option] button[role=checkbox]')
    await repPage.waitFor(`document.querySelector('[data-testid=plan-customers-count]')`)
    await repPage.click('[data-testid=plan-day-save]')
    await repPage.waitFor(`!document.querySelector('[data-testid=plan-day-dialog]')`, 20000)
    await repPage.waitFor(
      `document.querySelector(${JSON.stringify(todayCard + ' [data-testid=plan-day-city]')})`,
    )
    assert.equal(await rep.text(`${todayCard} [data-testid=plan-day-city]`), 'Nasr City')
    assert.ok((await rep.text(todayCard)).includes('Clinics in the morning'))
    // Today has started: planned against done shows on the day.
    assert.ok(await rep.exists(`${todayCard} [data-testid=plan-day-actuals]`))
    assert.ok(await rep.exists(`${todayCard} [data-testid=plan-day-customers]`))
  })

  await check('the rep sends the plan and can no longer change it', async () => {
    await repPage.click('[data-testid=plan-submit]')
    await repPage.waitFor(`document.querySelector('[data-testid=plan-submit-dialog]')`)
    await repPage.click('[data-testid=plan-submit-confirm]')
    await repPage.waitFor(`document.querySelector('[data-testid=plan-waiting]')`, 20000)
    assert.equal(await rep.text('[data-testid=plan-status]'), 'Waiting for review')
    assert.equal(await rep.exists('[data-testid=plan-day-edit]'), false)
    assert.equal(await rep.exists('[data-testid=plan-submit]'), false)
    assert.ok((await rep.text('[data-testid=plan-history]')).includes('Waiting for review'))
  })

  await check('the supervisor finds it on the dashboard and must write a note to return it', async () => {
    await signIn(bossPage, baseUrl, 'supervisor@demo.local', password)
    await bossPage.waitFor(`location.pathname.startsWith('/admin')`)
    await bossPage.waitFor(
      `Number(document.querySelector('[data-testid=dashboard-plans-count]')?.textContent) >= 1`,
      20000,
    )
    await bossPage.click('[data-testid=dashboard-plans]')
    await bossPage.waitFor(`location.pathname === '/admin/plans'`)
    await bossPage.waitFor(
      `[...document.querySelectorAll('[data-testid=plan-row]')].some((r) => r.textContent.includes('Demo Rep'))`,
      20000,
    )
    await boss.noSideScroll()
    await bossPage.evaluate(
      `[...document.querySelectorAll('[data-testid=plan-row]')].find((r) => r.textContent.includes('Demo Rep')).click()`,
    )
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-return]')`, 20000)
    assert.ok(await boss.exists('[data-testid=plan-history]'))
    assert.ok(await boss.exists(`${todayCard} [data-testid=plan-day-actuals]`))
    await boss.noSideScroll()
    await bossPage.click('[data-testid=plan-return]')
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-review-dialog]')`)
    await bossPage.click('[data-testid=plan-review-confirm]')
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-review-note-required]')`)
    await bossPage.fill('#plan-review-note', 'Please add two more visits today')
    await bossPage.click('[data-testid=plan-review-confirm]')
    await bossPage.waitFor(`!document.querySelector('[data-testid=plan-review-dialog]')`, 20000)
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-status]')?.textContent === 'Returned'`)
    assert.equal(await boss.exists('[data-testid=plan-return]'), false)
  })

  await check('the rep reads the note; offline the plan is read-only', async () => {
    await rep.reload('/rep/plans')
    await repPage.waitFor(`document.querySelector('[data-testid=plan-review-note]')`, 20000)
    assert.ok((await rep.text('[data-testid=plan-review-note]')).includes('Please add two more visits today'))
    await repPage.offline(true)
    await repPage.waitFor(`document.querySelector('[data-testid=plan-offline]')`)
    assert.equal(await rep.exists('[data-testid=plan-day-edit]'), false)
    assert.ok(await repPage.evaluate(`document.querySelector('[data-testid=plan-submit]').disabled`))
    await repPage.offline(false)
    await repPage.waitFor(`!document.querySelector('[data-testid=plan-offline]')`)
    await repPage.waitFor(`document.querySelector('[data-testid=plan-day-edit]')`)
  })

  await check('the rep changes the day and sends the plan again', async () => {
    await repPage.click(`${todayCard} [data-testid=plan-day-edit]`)
    await repPage.waitFor(`document.querySelector('#plan-target')`)
    await repPage.click('[data-testid=plan-target-more]')
    await repPage.click('[data-testid=plan-target-more]')
    await repPage.click('[data-testid=plan-day-save]')
    await repPage.waitFor(`!document.querySelector('[data-testid=plan-day-dialog]')`, 20000)
    await repPage.waitFor(
      `(document.querySelector(${JSON.stringify(todayCard)})?.textContent ?? '').includes('of 7 visits')`,
    )
    await repPage.click('[data-testid=plan-submit]')
    await repPage.waitFor(`document.querySelector('[data-testid=plan-submit-dialog]')`)
    await repPage.click('[data-testid=plan-submit-confirm]')
    await repPage.waitFor(`document.querySelector('[data-testid=plan-waiting]')`, 20000)
  })

  await check('the supervisor approves with a note; the plan is locked and can be reopened', async () => {
    await boss.nav('/admin')
    await boss.nav('/admin/plans')
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-row]')`, 20000)
    await bossPage.click('[data-testid=plan-row]')
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-approve]')`, 20000)
    await bossPage.click('[data-testid=plan-approve]')
    await bossPage.waitFor(`document.querySelector('[data-testid=plan-review-dialog]')`)
    await bossPage.fill('#plan-review-note', 'Good plan')
    await bossPage.click('[data-testid=plan-review-confirm]')
    await bossPage.waitFor(
      `document.querySelector('[data-testid=plan-status]')?.textContent === 'Approved'`,
      20000,
    )
    assert.ok(await boss.exists('[data-testid=plan-reopen]'))
    assert.equal(
      await bossPage.evaluate(`document.querySelectorAll('[data-testid=plan-history-event]').length`),
      5,
      'created, sent, returned, sent, approved',
    )
    await boss.nav('/admin/plans')
    await bossPage.waitFor(`!document.querySelector('[data-testid=plan-row]')`, 20000)
  })

  await check('the rep sees the approval and cannot change the plan', async () => {
    await rep.reload('/rep/plans')
    await repPage.waitFor(
      `document.querySelector('[data-testid=plan-status]')?.textContent === 'Approved'`,
      20000,
    )
    assert.ok((await rep.text('[data-testid=plan-review-note]')).includes('Good plan'))
    assert.equal(await rep.exists('[data-testid=plan-day-edit]'), false)
    assert.equal(await rep.exists('[data-testid=plan-day-add]'), false)
    assert.equal(await rep.exists('[data-testid=plan-submit]'), false)
    await rep.nav('/rep/notifications')
    await repPage.waitFor(`document.querySelector('main').textContent.includes('approved your plan')`, 20000)
  })

  for (const page of [repPage, bossPage]) {
    assert.deepEqual(
      page.problems.filter(
        (p) => !/Failed to load resource|negotiation|start the connection|ERR_INTERNET_DISCONNECTED/.test(p),
      ),
      [],
    )
  }
  console.log(`# ${passed} checks passed`)
} finally {
  await repPage.close()
  await bossPage.close()
}
