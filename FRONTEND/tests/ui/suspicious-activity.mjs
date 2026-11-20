/**
 * Suspicious location activity in the dashboard: a rep's phone reports a fake (mock) location, the
 * supervisor reviews the rep's day, opens the evidence and acknowledges it with a comment; the admin
 * changes the location trust settings. Needs the API and the dev server on a throwaway database with
 * the demo data (the check creates location points and flags):
 *   UI_TEST_PASSWORD=... UI_TEST_URL=http://localhost:5174 UI_TEST_API=http://localhost:5081 npm run test:ui:suspicious
 * Set UI_TEST_SHOTS to a folder to keep a screenshot of every checked screen.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, signIn } from './browser.mjs'

const baseUrl = process.env.UI_TEST_URL ?? 'http://localhost:5174'
const apiUrl = process.env.UI_TEST_API ?? baseUrl
const password = process.env.UI_TEST_PASSWORD
const shots = process.env.UI_TEST_SHOTS
if (!password) throw new Error('Set UI_TEST_PASSWORD to the demo password.')
if (shots) mkdirSync(shots, { recursive: true })

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

const login = async (email) =>
  (
    await api('/api/auth/login', {
      method: 'POST',
      body: { email, password, client: 'native', deviceId: 'ui-check' },
    })
  ).accessToken

const byId = (id) => `document.querySelector('[data-testid=${id}]')`

/** In-app navigation: full reloads would spend the sign-in rate limit. */
const nav = (page, path) =>
  page.evaluate(`(() => {
    history.pushState({}, '', ${JSON.stringify(path)})
    dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  })()`)

async function checkLayout(page, label) {
  await page.sleep(450)
  const report = await page.evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    arabicDigits: (document.body.innerText.match(/[\\u0660-\\u0669\\u06F0-\\u06F9]/g) ?? []).length,
  }))()`)
  assert.ok(report.overflow <= 0, `${label}: scrolls sideways by ${report.overflow}px`)
  assert.equal(report.arabicDigits, 0, `${label}: Arabic-Indic digits on screen`)
  if (shots) writeFileSync(join(shots, `${label}.png`), await page.screenshot())
}

let passed = 0
async function check(title, run) {
  await run()
  passed++
  console.log(`ok - ${title}`)
}

// The rep's phone registers (as the app does on open), then uploads a batch whose last fix came from a
// mock provider, with its device signals.
const repToken = await login('rep@demo.local')
await api('/api/tracking/device-health', {
  token: repToken,
  method: 'POST',
  body: {
    deviceId: 'ui-check',
    source: 'native',
    platform: 'android',
    trigger: 'appOpen',
    locationPermission: 'always',
    preciseLocation: true,
    notificationPermission: 'granted',
    locationServicesEnabled: true,
    mockLocationDetected: true,
    developerOptionsEnabled: true,
    onboardingCompleted: true,
  },
})
const now = Date.now()
const point = (secondsAgo, lat, isMock = false) => ({
  lat,
  lng: 31.3301,
  accuracy: 9,
  timestamp: new Date(now - secondsAgo * 1000).toISOString(),
  isMock,
  altitude: 41.5,
  activityType: 'still',
  activityConfidence: 80,
  deviceTime: new Date(now - secondsAgo * 1000).toISOString(),
})
const batch = await api('/api/tracking/locations', {
  token: repToken,
  method: 'POST',
  body: {
    deviceId: 'ui-check',
    source: 'native',
    points: [point(120, 30.05), point(60, 30.0505, true)],
    deviceSignals: {
      platform: 'android',
      developerOptionsEnabled: true,
      mockLocationAppSelected: true,
      spoofingApps: ['com.lexa.fakegps'],
      autoTimeEnabled: true,
      autoTimeZoneEnabled: true,
      emulator: false,
      rooted: false,
      collectedAt: new Date(now).toISOString(),
    },
  },
})
assert.equal(batch.flagged, true, 'the mock batch raises a flag')
const repId = (await api('/api/auth/me', { token: repToken })).user.id

const page = await launch()
try {
  await page.viewport(1280, 900)
  await signIn(page, baseUrl, 'supervisor@demo.local', password)
  await page.waitFor(`location.pathname.startsWith('/admin')`)

  await check('the dashboard summarises the suspicious activity of the team', async () => {
    await nav(page, '/admin')
    await page.waitFor(byId('suspicious-summary'), 20000)
    await checkLayout(page, '01-dashboard-summary-en')
  })

  await check('the review page lists the rep per day and shows the evidence', async () => {
    await nav(page, '/admin/suspicious-activity')
    await page.waitFor(byId('open-rep-day'), 20000)
    await checkLayout(page, '02-review-page-en')
    await page.evaluate(`[...document.querySelectorAll('[data-testid=open-rep-day]')]
      .find((b) => b.closest('tr').textContent.includes('Demo Rep'))?.click() ?? ${byId('open-rep-day')}.click()`)
    await page.waitFor(byId('rep-day-sheet'))
    await page.waitFor(byId('suspicious-event'))
    await page.evaluate(`[...document.querySelectorAll('[data-testid=suspicious-event] button')]
      .find((b) => b.getAttribute('aria-expanded') === 'false').click()`)
    await page.waitFor(byId('event-evidence'), 15000)
    await page.waitFor(byId('device-signals'))
    const evidence = await page.evaluate(`${byId('event-evidence')}.innerText`)
    assert.match(evidence, /com\.lexa\.fakegps/)
    assert.match(evidence, /Mock location/)
    await checkLayout(page, '03-evidence-en')
  })

  await check('acknowledging needs a comment and keeps it with the event', async () => {
    await page.click('[data-testid=acknowledge-event]')
    await page.waitFor(byId('acknowledge-comment'))
    assert.equal(await page.evaluate(`${byId('acknowledge-submit')}.disabled`), true)
    await page.fill('[data-testid=acknowledge-comment]', 'Called the rep, the fake GPS app is removed.')
    await page.waitFor(`!${byId('acknowledge-submit')}.disabled`)
    await page.click('[data-testid=acknowledge-submit]')
    await page.waitFor(`${byId('review-note')}?.innerText.includes('fake GPS app is removed')`, 15000)
    const events = await api(`/api/tracking/integrity/events?userId=${repId}`, {
      token: await login('supervisor@demo.local'),
    })
    assert.ok(events.some((e) => e.status === 'acknowledged' && e.reviewNote?.includes('removed')))
  })

  await check('the page reads right to left in Arabic and works in dark mode on a phone', async () => {
    await page.evaluate(`localStorage.setItem('op.language', 'ar'); localStorage.setItem('op.theme', 'dark')`)
    await page.viewport(390, 844, true)
    await page.goto(`${baseUrl}/admin/suspicious-activity?status=acknowledged`)
    await page.waitFor(byId('open-rep-day'), 20000)
    assert.equal(await page.evaluate('document.documentElement.dir'), 'rtl')
    assert.equal(await page.evaluate(`document.documentElement.classList.contains('dark')`), true)
    assert.match(await page.evaluate('document.body.innerText'), /النشاط المشبوه/)
    await checkLayout(page, '04-review-page-ar-dark-390')
  })

  await check("the live map marks the rep's latest position as suspicious", async () => {
    await page.viewport(1280, 900)
    await nav(page, `/admin/live-map?rep=${repId}`)
    await page.waitFor(byId('trust-badge'), 20000)
    await checkLayout(page, '05-live-map-ar-dark')
  })
} finally {
  await page.close()
}

const admin = await launch()
try {
  await check('an admin changes the location trust settings', async () => {
    await admin.viewport(1280, 900)
    await signIn(admin, baseUrl, 'admin@originalpharma.local', password)
    await admin.waitFor(`location.pathname.startsWith('/admin')`)
    await nav(admin, '/admin/settings')
    await admin.waitFor(byId('location-trust-form'), 20000)
    await checkLayout(admin, '06-settings-en')
    await admin.fill('#setting-maxDistanceFromDoctorMeters', '350')
    await admin.evaluate(`document.querySelector('input[name=mock-policy][value=flagAndExclude]').click()`)
    await admin.click('[data-testid=location-trust-form] button[type=submit]')
    await admin.waitFor(`document.querySelector('[role=status]')`, 15000)
    const saved = await api('/api/settings/location-trust', {
      token: await login('admin@originalpharma.local'),
    })
    assert.equal(saved.maxDistanceFromDoctorMeters, 350)
    assert.equal(saved.mockPolicy, 'flagAndExclude')
    assert.equal(saved.isDefault, false)
  })
} finally {
  await admin.close()
}

console.log(`${passed} checks passed`)
