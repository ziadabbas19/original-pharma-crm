/**
 * The rep's visit flow at phone size, in both languages and themes, with the location mocked. Needs the
 * API and the dev server running on a throwaway database with the demo data (the flow creates visits):
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 npm run test:ui:visits
 * Set UI_TEST_SHOTS to a folder to keep a screenshot of every checked screen.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5174'
const password = process.env.UI_TEST_PASSWORD
const shots = process.env.UI_TEST_SHOTS
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')
if (shots) mkdirSync(shots, { recursive: true })

const AHMED = { name: 'Dr. Ahmed Fathy', nameAr: 'د. أحمد فتحي', lat: 30.0511, lng: 31.3656 }
const MONA = { name: 'Dr. Mona Saeed', nameAr: 'د. منى سعيد', lat: 30.0594, lng: 31.3387 }
const TAMER = { name: 'Dr. Tamer Nabil', nameAr: 'د. تامر نبيل', lat: 30.0074, lng: 31.4913 }
const KARIM = { name: 'Dr. Karim Adel', nameAr: 'د. كريم عادل' }
const CLINIC = { name: 'Dr. Demo Clinic', nameAr: 'عيادة تجريبية', lat: 30.0561, lng: 31.3301 }

const page = await launch()
const byId = (id) => `document.querySelector('[data-testid=${id}]')`
const has = (id) => page.evaluate(`Boolean(${byId(id)})`)
const waitId = (id, timeout) => page.waitFor(byId(id), timeout)
const clickId = async (id) => {
  await waitId(id)
  await page.click(`[data-testid=${id}]`)
}

/** In-app navigation: full reloads would spend the sign-in rate limit. */
const nav = (path) =>
  page.evaluate(`(() => {
    history.pushState({}, '', ${JSON.stringify(path)})
    dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  })()`)

async function setLocale(language, theme, width) {
  await page.viewport(width, 800, true)
  await page.evaluate(
    `localStorage.setItem('op.language', '${language}'); localStorage.setItem('op.theme', '${theme}')`,
  )
  await page.goto(`${baseUrl}/rep/doctors`)
  await page.waitFor(`document.querySelector('[data-testid=tab-doctors]')`)
  assert.equal(await page.evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr')
  assert.equal(await page.evaluate(`document.documentElement.classList.contains('dark')`), theme === 'dark')
}

/** What every screen must respect: no sideways scroll, Latin digits, comfortable touch targets. */
async function checkScreen(label) {
  await page.sleep(450) // sheets and dialogs finish opening
  const report = await page.evaluate(`(() => {
    const root = document.querySelector('[role=dialog]') ?? document.querySelector('main')
    const small = [...root.querySelectorAll('button, a[href], select, input:not([type=file]):not([type=checkbox]), textarea, [role=tab]')]
      .filter((el) => {
        const box = (el.closest('label') ?? el).getBoundingClientRect()
        if (box.width === 0 || box.height === 0 || el.closest('.sr-only')) return false
        if (el.dataset.slot === 'sheet-close' || el.matches('[data-slot=sheet-content] > button, [data-slot=dialog-content] > button')) return false
        return box.height < 44
      })
      .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40) + ' ' + Math.round(el.getBoundingClientRect().height))
    const cutOff = [...root.querySelectorAll('*')]
      .filter((el) => {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || el.closest('.sr-only, .overflow-x-auto')) return false
        return box.right > window.innerWidth + 1 || box.left < -1
      })
      .map((el) => el.tagName + ' ' + (el.textContent ?? '').trim().slice(0, 30))
    return {
      cutOff,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      arabicDigits: (document.body.innerText.match(/[\\u0660-\\u0669\\u06F0-\\u06F9]/g) ?? []).length,
      small,
    }
  })()`)
  assert.ok(report.overflow <= 0, `${label}: scrolls sideways by ${report.overflow}px`)
  assert.deepEqual(report.cutOff, [], `${label}: content cut off at the screen edge`)
  assert.equal(report.arabicDigits, 0, `${label}: Arabic-Indic digits on screen`)
  assert.deepEqual(report.small, [], `${label}: touch targets under 44px`)
  if (shots) writeFileSync(join(shots, `${label}.png`), await page.screenshot())
}

const cardButton = (customer, testId) => `[...document.querySelectorAll('main li')]
  .find((li) => li.textContent.includes(${JSON.stringify(customer.name)}) || li.textContent.includes(${JSON.stringify(customer.nameAr)}))
  ?.querySelector('[data-testid=${testId}]')`

const cardLink = (customer) => `[...document.querySelectorAll('main li')]
  .find((li) => li.textContent.includes(${JSON.stringify(customer.name)}) || li.textContent.includes(${JSON.stringify(customer.nameAr)}))
  ?.querySelector('a[href^="/rep/customers/"]')`

async function openCheckIn(customer) {
  await nav('/rep/doctors')
  await page.waitFor(cardButton(customer, 'start-visit'))
  await page.evaluate(`${cardButton(customer, 'start-visit')}.click()`)
}

const closeSheet = () =>
  page.evaluate(`[...document.querySelectorAll('[role=dialog] button')].at(-1).click()`)

const closeSheetX = () =>
  page.evaluate(`document.querySelector('[data-slot=sheet-content] > button:last-of-type').click()`)

let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

try {
  await page.viewport(360, 800, true)
  await page.allowGeolocation(baseUrl)
  await page.geolocation(AHMED)
  await signIn(page, baseUrl, 'rep@demo.local', password)
  await page.waitFor(`location.pathname.startsWith('/rep')`)

  await check('inside range: the result is shown and the visit starts (en, light, 360 px)', async () => {
    await setLocale('en', 'light', 360)
    await checkScreen('01-customers-en-light')
    await openCheckIn(AHMED)
    await waitId('proximity-inside', 25000)
    await checkScreen('02-check-in-inside-en-light')
    await clickId('check-in-start')
    await page.waitFor(`location.pathname === '/rep/visits/active'`)
    await waitId('active-timer')
    assert.match(await page.evaluate(`${byId('active-customer')}.textContent`), /Ahmed Fathy/)
    await waitId('sync-sent', 20000)
  })

  await check('a second visit is blocked while one is in progress', async () => {
    await openCheckIn(MONA)
    await waitId('check-in-blocked')
    assert.equal(await page.evaluate(`${byId('check-in-start')}.disabled`), true)
    await closeSheet()
  })

  await check('products, notes and feedback survive the app being killed', async () => {
    await nav('/rep/visits/active')
    await clickId('add-products')
    await page.waitFor(`document.querySelector('[role=dialog] ul button')`)
    await page.evaluate(`document.querySelector('[role=dialog] ul button').click()`)
    await page.evaluate(
      `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.querySelector('.lucide-x'))?.click()`,
    )
    await page.waitFor(`!document.querySelector('[role=dialog]')`)
    await page.waitFor(`document.querySelector('main input[maxlength="300"]')`)
    await page.fill('main input[maxlength="300"]', 'Left the new leaflet')
    await page.fill('#visit-feedback', 'Interested in the new pack size')
    await page.click('[aria-pressed=false].rounded-full')
    await page.sleep(800)
    await checkScreen('03-active-visit-en-light')

    await page.goto(`${baseUrl}/rep/visits/active`)
    await waitId('active-timer')
    await page.waitFor(
      `document.querySelector('#visit-feedback')?.value === 'Interested in the new pack size'`,
    )
    assert.equal(
      await page.evaluate(`document.querySelector('main input[maxlength="300"]').value`),
      'Left the new leaflet',
    )
  })

  await check('the order shortcut carries the visit and the customer', async () => {
    const href = await page.evaluate(
      `document.querySelector('[data-testid=active-order]').getAttribute('href')`,
    )
    assert.match(href, /\/rep\/orders\/new\?/)
    assert.match(href, /visitId=/)
    assert.match(href, /customerId=/)
  })

  await check('check-out asks first, captures the location and shows the finished visit', async () => {
    await clickId('check-out')
    await waitId('check-out-located', 25000)
    await checkScreen('04-check-out-en-light')
    await clickId('check-out-confirm')
    await page.waitFor(`/^\\/rep\\/visits\\/[0-9a-f-]{36}$/.test(location.pathname)`)
    await waitId('visit-verification', 20000)
    await page.waitFor(`!document.querySelector('[data-testid=sync-waiting]')`, 20000)
    await page.waitFor(`document.body.innerText.includes('Interested in the new pack size')`)
    await checkScreen('05-visit-detail-en-light')
  })

  await check(
    'pharmacies are listed and a visit starts from the customer screen with a proof photo',
    async () => {
      await nav('/rep/doctors')
      await clickId('tab-pharmacies')
      await page.waitFor(`document.body.innerText.includes('Demo Pharmacy')`, 20000)
      await page.waitFor(`document.querySelector('main [data-testid=start-visit]')`)
      await checkScreen('05a-pharmacies-en-light')
      await clickId('tab-doctors')

      await page.geolocation(CLINIC)
      await page.waitFor(cardLink(CLINIC))
      await page.evaluate(`${cardLink(CLINIC)}.click()`)
      await waitId('customer-has-location')
      await checkScreen('05b-customer-en-light')
      await clickId('start-visit')
      await waitId('proximity-inside', 25000)

      await page.evaluate(`(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 3000
      canvas.height = 2000
      const context = canvas.getContext('2d')
      context.fillStyle = '#0063ad'
      context.fillRect(0, 0, 3000, 2000)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const input = document.querySelector('[data-testid=check-in-photo]')
      const files = new DataTransfer()
      files.items.add(new File([blob], 'proof.png', { type: 'image/png' }))
      input.files = files.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
      await page.waitFor(`document.querySelector('[role=dialog] img')?.src.startsWith('data:image/jpeg')`)
      await clickId('check-in-start')
      await waitId('active-timer')
      await waitId('sync-sent', 20000)
    },
  )

  await check('an order taken from the visit is linked to it', async () => {
    await clickId('active-order')
    await page.waitFor(`location.pathname === '/rep/orders/new'`)
    await page.waitFor(`document.querySelector('#place-name')?.value.includes('Demo Clinic')`)
    await page.waitFor(`document.querySelector('#collection option:nth-child(2)')`)
    await page.evaluate(`(() => {
      const select = document.querySelector('#collection')
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, select.options[1].value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await page.evaluate(`[...document.querySelectorAll('main section button')][0].click()`)
    await page.waitFor(`document.querySelector('[role=dialog] ul button')`)
    await page.evaluate(`document.querySelector('[role=dialog] ul button').click()`)
    await closeSheetX()
    await page.waitFor(`!document.querySelector('[role=dialog]')`)
    await page.click('main button[type=submit]')
    await page.waitFor(`location.pathname === '/rep/visits/active'`, 20000)
    await waitId('active-timer')
  })

  await check('a forgotten visit is raised on app open and closes with a note and no signal', async () => {
    await page.evaluate(`new Promise((resolve, reject) => {
      const open = indexedDB.open('original-pharma')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const store = open.result.transaction('outbox', 'readwrite').objectStore('outbox')
        const all = store.getAll()
        all.onsuccess = () => {
          const row = all.result.find((r) => r.kind === 'visit-active')
          row.payload.checkInAt = new Date(Date.now() - 5 * 3600 * 1000).toISOString()
          store.put(row).onsuccess = () => resolve(true)
        }
      }
    })`)
    await page.goto(`${baseUrl}/rep/visits/active`)
    await waitId('forgot-banner', 20000)
    await waitId('active-timer')
    await checkScreen('05c-forgot-banner-en-light')

    await page.evaluate(
      `navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 2, message: 'no signal' })`,
    )
    await clickId('forgot-explain')
    await waitId('check-out-no-location', 25000)
    assert.equal(await page.evaluate(`${byId('check-out-confirm')}.disabled`), true, 'the note is required')
    await checkScreen('05d-check-out-no-signal-en-light')
    await page.fill('#check-out-notes', 'Forgot to check out when leaving the clinic')
    await page.waitFor(`!${byId('check-out-confirm')}.disabled`)
    await clickId('check-out-confirm')
    await page.waitFor(`/^\\/rep\\/visits\\/[0-9a-f-]{36}$/.test(location.pathname)`)
    await waitId('visit-review-reasons', 20000)
    await waitId('visit-orders', 20000)
    await waitId('visit-photo', 20000)
    await page.waitFor(`document.body.innerText.includes('Forgot to check out when leaving the clinic')`)
    await page.evaluate(`delete navigator.geolocation.getCurrentPosition`)
    await checkScreen('05e-visit-full-en-light')
  })

  await check(
    'outside range: distance, an honest message and a flagged visit (ar, dark, 430 px)',
    async () => {
      await setLocale('ar', 'dark', 430)
      await page.geolocation({ lat: MONA.lat + 0.006, lng: MONA.lng })
      await openCheckIn(MONA)
      await waitId('proximity-outside', 25000)
      await checkScreen('06-check-in-outside-ar-dark')
      assert.equal(await page.evaluate(`${byId('check-in-start')}.disabled`), false)
      await clickId('check-in-start')
      await waitId('active-flagged')
      await checkScreen('07-active-flagged-ar-dark')
      await clickId('check-out')
      await waitId('check-out-located', 25000)
      await clickId('check-out-confirm')
      await waitId('visit-verification', 20000)
      await waitId('visit-review-reasons')
      await checkScreen('08-visit-flagged-ar-dark')
    },
  )

  await check(
    'location denied: no visit can start and the rep is told what to do (en, dark, 390 px)',
    async () => {
      await setLocale('en', 'dark', 390)
      await page.evaluate(
        `navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 1, message: 'denied' })`,
      )
      await openCheckIn(AHMED)
      await waitId('proximity-unavailable', 25000)
      assert.equal(await page.evaluate(`${byId('check-in-start')}.disabled`), true)
      await waitId('proximity-retry')
      await checkScreen('09-check-in-denied-en-dark')
      await closeSheet()
      await page.evaluate(`delete navigator.geolocation.getCurrentPosition`)
    },
  )

  await check('a customer with no saved location is not blocked: the first visit will save it', async () => {
    await page.geolocation(AHMED)
    await openCheckIn(KARIM)
    await waitId('proximity-first-visit', 25000)
    await waitId('proximity-map-card')
    assert.equal(await page.evaluate(`${byId('check-in-start')}.disabled`), false)
    await checkScreen('10-check-in-first-visit-en-dark')
    await closeSheet()
  })

  await check(
    'offline: the visit waits on the phone and sends itself when back online (ar, light, 360 px)',
    async () => {
      await setLocale('ar', 'light', 360)
      await page.geolocation(TAMER)
      // The installed app has its screens on the phone; the dev server loads each one on first use.
      await nav('/rep/visits/active')
      await waitId('day-picker')
      await nav('/rep/visits/00000000-0000-0000-0000-000000000000')
      await page.waitFor(`document.querySelector('main a[href="/rep/visits"]')`)
      await nav('/rep/doctors')
      await page.waitFor(cardButton(TAMER, 'start-visit'))
      await page.offline(true)
      await openCheckIn(TAMER)
      await waitId('proximity-inside', 25000)
      await waitId('check-in-offline')
      await checkScreen('11-check-in-offline-ar-light')
      await clickId('check-in-start')
      await waitId('sync-waiting')
      await checkScreen('12-active-offline-ar-light')

      await clickId('check-out')
      await waitId('check-out-located', 25000)
      await clickId('check-out-confirm')
      await waitId('local-visit')
      await checkScreen('13-visit-waiting-ar-light')

      await nav('/rep/visits')
      await waitId('sync-waiting')
      await waitId('visit-retry')
      await checkScreen('14-list-waiting-ar-light')

      await page.offline(false)
      await page.evaluate(`dispatchEvent(new Event('online'))`)
      await page.waitFor(`!document.querySelector('[data-testid=sync-waiting]')`, 30000)
      await page.waitFor(`!document.querySelector('[data-testid=visit-retry]')`, 30000)
    },
  )

  await check('my visits: the day picker, status chips and filters', async () => {
    await nav('/rep/visits')
    await waitId('visit-list', 20000)
    await waitId('status-completed')
    await waitId('status-review')
    const all = await page.evaluate(`document.querySelectorAll('[data-testid=visit-list] > li').length`)
    await page.click('[data-testid=filter-feedback]')
    await page.sleep(100)
    const withFeedback = await page.evaluate(
      `document.querySelectorAll('[data-testid=visit-list] > li').length`,
    )
    assert.ok(withFeedback < all, 'the feedback filter narrows the list')
    await page.click('[data-testid=filter-feedback]')
    await checkScreen('15-my-visits-ar-light')
  })

  await check("a supervisor's reply shows on the visit and its notification is marked seen", async () => {
    const list = await page.evaluate(`(async () => {
      const auth = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'web' }) }).then((r) => r.json())
      const headers = { Authorization: 'Bearer ' + auth.accessToken }
      const notifications = await fetch('/api/notifications?unreadOnly=true&limit=200', { headers }).then((r) => r.json())
      return notifications.filter((n) => n.type === 'visitFeedbackReply').map((n) => n.entityId)
    })()`)
    assert.ok(list.length > 0, 'the demo data has an unread reply')
    await nav(`/rep/visits/${list[0]}`)
    await waitId('visit-verification', 20000)
    await page.waitFor(
      `document.body.innerText.includes('Samples go out') || document.body.innerText.includes('stock arrives')`,
    )
    await page.sleep(1200)
    const left = await page.evaluate(`(async () => {
      const auth = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'web' }) }).then((r) => r.json())
      const notifications = await fetch('/api/notifications?unreadOnly=true&limit=200', { headers: { Authorization: 'Bearer ' + auth.accessToken } }).then((r) => r.json())
      return notifications.filter((n) => n.entityId === ${JSON.stringify(list[0])}).length
    })()`)
    assert.equal(left, 0)
  })

  await check('the dashboard shows the verification result to the supervisor', async () => {
    await page.viewport(1440, 900, false)
    await page.evaluate(`(async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      localStorage.clear()
    })()`)
    await signIn(page, baseUrl, 'supervisor@demo.local', password)
    await page.goto(`${baseUrl}/admin/visits`)
    await page.waitFor(
      `[...document.querySelectorAll('tbody tr')].some((r) => r.querySelector('[data-testid=location-badge-flagged]'))`,
      20000,
    )
    await page.evaluate(
      `[...document.querySelectorAll('tbody tr')].find((r) => r.querySelector('[data-testid=location-badge-flagged]')).click()`,
    )
    await waitId('visit-verification', 20000)
    await waitId('visit-review-reasons')
    const text = await page.evaluate(`${byId('visit-verification')}.innerText`)
    assert.match(text, /Accuracy/)
    assert.match(text, /allowed/)
    if (shots) writeFileSync(join(shots, '16-dashboard-detail.png'), await page.screenshot())
  })

  assert.deepEqual(page.problems, [], 'no errors in the browser console')
  console.log(`\n${passed} checks passed`)
} finally {
  await page.close()
}
