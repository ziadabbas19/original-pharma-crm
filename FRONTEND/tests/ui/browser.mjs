/**
 * Small headless Chromium driver over the DevTools protocol (Node's built-in WebSocket), so the UI
 * checks need no extra packages. Set CHROME_PATH, or a Playwright browser in ~/.cache is used.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const root = join(homedir(), '.cache/ms-playwright')
  const dir = readdirSync(root).find((name) => name.startsWith('chromium_headless_shell'))
  if (!dir) throw new Error('No Chromium found. Set CHROME_PATH.')
  return join(root, dir, 'chrome-headless-shell-linux64/chrome-headless-shell')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'op-ui-'))
  const port = 9300 + Math.floor(Math.random() * 500)
  const chrome = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(100)
    target = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .then((list) => list.find((t) => t.type === 'page'))
      .catch(() => undefined)
  }
  if (!target) throw new Error('Chromium did not start')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
  let nextId = 1
  const pending = new Map()
  const problems = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') {
      problems.push(message.params.exceptionDetails.exception?.description ?? 'exception')
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      problems.push(message.params.args.map((a) => a.value ?? a.description).join(' '))
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  await send('Page.enable')
  await send('Runtime.enable')

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? expression)
    return result.result.value
  }

  const page = {
    problems,
    evaluate,
    async viewport(width, height, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    },
    async goto(url) {
      await send('Page.navigate', { url })
      await sleep(300)
      await page.waitFor(`document.readyState === 'complete'`)
    },
    async waitFor(condition, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs
      while (Date.now() < end) {
        if (await evaluate(`Boolean(${condition})`).catch(() => false)) return
        await sleep(100)
      }
      throw new Error(`Timed out waiting for: ${condition}`)
    },
    sleep,
    /** Cuts the page off the network (the app sees navigator.onLine = false) or brings it back. */
    async offline(value) {
      await send('Network.enable')
      await send('Network.emulateNetworkConditions', {
        offline: value,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    },
    /** Types into an input the way React expects. */
    async fill(selector, value) {
      await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)})
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
    },
    click: (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    async screenshot() {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      return Buffer.from(data, 'base64')
    },
    async close() {
      socket.close()
      chrome.kill('SIGKILL')
      await sleep(200)
      rmSync(profile, { recursive: true, force: true })
    },
  }
  return page
}

/** Signs in through the login form; language and theme are set first, as a returning user has them. */
export async function signIn(page, baseUrl, email, password, { language = 'en', theme = 'light' } = {}) {
  await page.goto(`${baseUrl}/login`)
  await page.evaluate(
    `localStorage.setItem('op.language', '${language}'); localStorage.setItem('op.theme', '${theme}')`,
  )
  await page.goto(`${baseUrl}/login`)
  await page.waitFor(`document.querySelector('input[type=password]')`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.sleep(100)
  await page.click('button[type=submit]')
  await page.waitFor(`!location.pathname.startsWith('/login')`)
}
