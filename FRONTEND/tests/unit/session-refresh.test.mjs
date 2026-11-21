import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { apiFetch, configureApiClient } from '../../src/lib/api-client.ts'
import { ApiError, NetworkError } from '../../src/lib/errors/types.ts'
import {
  deviceLabel,
  needsRefresh,
  onceUntilRearmed,
  refreshOutcomeOf,
  REFRESH_AHEAD_MS,
  singleFlight,
} from '../../src/lib/session-refresh.ts'

const problem = (status, code) => new ApiError(status, { status, code })

describe('refresh outcome', () => {
  test('only the server saying 401 ends the session', () => {
    assert.equal(refreshOutcomeOf(problem(401, 'invalid-refresh-token')), 'expired')
  })

  test('offline, timeouts, rate limits and server errors keep it', () => {
    for (const error of [
      new NetworkError(),
      new TypeError('Failed to fetch'),
      new DOMException('timed out', 'TimeoutError'),
      problem(408),
      problem(429),
      problem(500),
      problem(502),
      problem(503),
      problem(400, 'bad-request'),
      new Error('secure storage unavailable'),
    ]) {
      assert.equal(refreshOutcomeOf(error), 'unavailable', String(error?.status ?? error))
    }
  })

  test('renews a token that is about to run out, or that is unknown', () => {
    const now = Date.parse('2026-11-20T10:00:00Z')
    assert.equal(needsRefresh(null, now), true)
    assert.equal(needsRefresh(new Date(now + REFRESH_AHEAD_MS - 1).toISOString(), now), true)
    assert.equal(needsRefresh(new Date(now + 10 * 60_000).toISOString(), now), false)
  })
})

describe('singleFlight and onceUntilRearmed', () => {
  test('callers that arrive together share one run; a later call runs again', async () => {
    let runs = 0
    let release
    const shared = singleFlight(() => {
      runs++
      return new Promise((resolve) => (release = resolve))
    })
    const all = Promise.all([shared(), shared(), shared()])
    release('done')
    assert.deepEqual(await all, ['done', 'done', 'done'])
    assert.equal(runs, 1)
    const again = shared()
    release('again')
    await again
    assert.equal(runs, 2)
  })

  test('a rejected run is not kept: the next call tries again', async () => {
    let runs = 0
    const shared = singleFlight(async () => {
      runs++
      throw new Error('offline')
    })
    await assert.rejects(shared())
    await assert.rejects(shared())
    assert.equal(runs, 2)
  })

  test('signing out runs once until the next sign-in', async () => {
    let ended = 0
    const signOut = onceUntilRearmed(async () => {
      ended++
    })
    await Promise.all([signOut.run(), signOut.run(), signOut.run()])
    assert.equal(ended, 1)
    signOut.rearm()
    await signOut.run()
    assert.equal(ended, 2)
  })
})

describe('apiFetch with the session refresh', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /**
   * A fake server: /api/data answers 401 until the token is "fresh", /api/auth/refresh is counted and
   * answers with `refreshReply`. Wires the client the way session.ts does.
   */
  function setup({ refreshReply, dataAfterRefresh = 200 }) {
    const calls = { refresh: 0, data: 0, signOuts: 0 }
    let token = 'stale'
    globalThis.fetch = async (url, init) => {
      const path = new URL(url, 'http://test').pathname
      if (path === '/api/data') {
        calls.data++
        const auth = new Headers(init?.headers).get('Authorization')
        const status = auth === 'Bearer fresh' ? dataAfterRefresh : 401
        return new Response(status === 200 ? '{"ok":true}' : '{"code":"unauthenticated"}', { status })
      }
      throw new Error(`unexpected ${path}`)
    }
    const signOut = onceUntilRearmed(async () => {
      calls.signOuts++
    })
    const refresh = singleFlight(async () => {
      calls.refresh++
      await new Promise((resolve) => setTimeout(resolve, 5))
      let outcome
      try {
        await refreshReply()
        token = 'fresh'
        return 'ok'
      } catch (error) {
        outcome = refreshOutcomeOf(error)
      }
      if (outcome === 'expired') await signOut.run()
      return outcome
    })
    configureApiClient({
      getAccessToken: () => token,
      refreshSession: refresh,
      onPermissionsVersion: () => {},
      onUnauthorized: () => void signOut.run(),
      onPasswordChangeRequired: () => {},
    })
    return calls
  }

  test('parallel requests that find the token expired share one refresh', async () => {
    const calls = setup({ refreshReply: async () => {} })
    const results = await Promise.all(Array.from({ length: 5 }, () => apiFetch('/api/data')))
    assert.deepEqual(results, Array(5).fill({ ok: true }))
    assert.equal(calls.refresh, 1)
    assert.equal(calls.signOuts, 0)
  })

  test('no sign-out when the refresh cannot reach the server', async () => {
    const calls = setup({
      refreshReply: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await assert.rejects(apiFetch('/api/data'), NetworkError)
    assert.equal(calls.signOuts, 0)
  })

  test('no sign-out on a rate limit or a server error during the refresh', async () => {
    for (const status of [429, 500, 503]) {
      const calls = setup({
        refreshReply: async () => {
          throw problem(status)
        },
      })
      await assert.rejects(apiFetch('/api/data'), NetworkError)
      assert.equal(calls.signOuts, 0, `status ${status}`)
    }
  })

  test('one sign-out when the server refuses the refresh, however many requests failed', async () => {
    const calls = setup({
      refreshReply: async () => {
        throw problem(401, 'invalid-refresh-token')
      },
    })
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => apiFetch('/api/data')))
    for (const result of results) {
      assert.equal(result.status, 'rejected')
      assert.equal(result.reason.status, 401)
    }
    assert.equal(calls.refresh, 1)
    assert.equal(calls.signOuts, 1)
  })

  test('no refresh loop: a request still refused after a good refresh is reported, not retried again', async () => {
    const calls = setup({ refreshReply: async () => {}, dataAfterRefresh: 401 })
    await assert.rejects(apiFetch('/api/data'), (error) => error.status === 401)
    assert.equal(calls.refresh, 1)
    assert.equal(calls.data, 2)
  })
})

describe('deviceLabel', () => {
  test('native: manufacturer and model', () => {
    assert.equal(
      deviceLabel({ isNative: true, manufacturer: 'samsung', model: 'SM-A546E' }),
      'samsung SM-A546E',
    )
    assert.equal(deviceLabel({ isNative: true, manufacturer: null, model: null }), 'Android')
  })

  test('web: browser and system', () => {
    const web = { isNative: false, manufacturer: null, model: null }
    assert.equal(
      deviceLabel(
        web,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      ),
      'Chrome on Windows',
    )
    assert.equal(
      deviceLabel(
        web,
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 EdgA/1 Edg/140',
      ),
      'Edge on Android',
    )
    assert.equal(
      deviceLabel(
        web,
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
      'Safari on iOS',
    )
  })
})
