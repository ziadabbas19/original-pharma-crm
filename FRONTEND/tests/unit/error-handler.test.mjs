import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import i18next from 'i18next'
import ar from '../../src/lib/i18n/locales/ar.json' with { type: 'json' }
import en from '../../src/lib/i18n/locales/en.json' with { type: 'json' }
import {
  applyFieldErrors,
  configureErrorHandler,
  getErrorMessage,
  getErrorReference,
  handleError,
  normalizeError,
  OFFLINE_TOAST_MS,
  resetErrorHandler,
  restoreError,
  TOAST_DEDUPE_MS,
} from '../../src/lib/errors/error-handler.ts'
import { ApiError, NetworkError, UserFacingError } from '../../src/lib/errors/types.ts'

const i18n = i18next.createInstance()
await i18n.init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: 'ar',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})
const tAr = i18n.getFixedT('ar')
const tEn = i18n.getFixedT('en')

const problem = (status, body = {}) => new ApiError(status, { status, ...body })

describe('normalizeError', () => {
  const cases = [
    ['network (NetworkError)', new NetworkError(), 'network'],
    ['network (fetch TypeError)', new TypeError('Failed to fetch'), 'network'],
    ['network (status 0)', problem(0), 'network'],
    ['timeout (TimeoutError)', new DOMException('signal timed out', 'TimeoutError'), 'timeout'],
    ['timeout (408)', problem(408), 'timeout'],
    ['timeout (504)', problem(504), 'timeout'],
    ['unauthorized', problem(401, { code: 'invalid-refresh-token' }), 'unauthorized'],
    ['forbidden', problem(403, { code: 'forbidden' }), 'forbidden'],
    ['notFound', problem(404, { code: 'not-found' }), 'notFound'],
    ['conflict (409)', problem(409, { code: 'role_name_taken' }), 'conflict'],
    ['conflict (422 business rule)', problem(422, { code: 'visit-in-progress' }), 'conflict'],
    [
      'validation (400 with errors)',
      problem(400, { code: 'validation', errors: { email: ['Required'] } }),
      'validation',
    ],
    ['validation (client check)', new UserFacingError('Too large'), 'validation'],
    ['rateLimited', problem(429), 'rateLimited'],
    ['server (500)', problem(500, { code: 'server-error' }), 'server'],
    ['server (503)', problem(503), 'server'],
    ['cancelled (AbortError)', new DOMException('aborted', 'AbortError'), 'cancelled'],
    ['cancelled (query cancelled)', new Error('CancelledError'), 'cancelled'],
    ['unknown (Error)', new Error('boom'), 'unknown'],
    ['unknown (string)', 'boom', 'unknown'],
    ['unknown (nothing)', undefined, 'unknown'],
    ['unknown (418)', problem(418), 'unknown'],
  ]
  for (const [name, error, kind] of cases) {
    test(name, () => assert.equal(normalizeError(error).kind, kind))
  }

  test('a plain TypeError from code is not mistaken for a network failure', () => {
    assert.equal(
      normalizeError(new TypeError("Cannot read properties of undefined (reading 'x')")).kind,
      'unknown',
    )
  })

  test('only failures that can pass by themselves are retryable', () => {
    const retryable = ['network', 'timeout', 'rateLimited', 'server']
    for (const [, error, kind] of cases) {
      assert.equal(normalizeError(error).retryable, retryable.includes(kind), kind)
    }
  })

  test('ProblemDetails with validation errors', () => {
    const e = normalizeError(
      problem(400, {
        code: 'validation',
        title: 'One or more fields are invalid.',
        traceId: '00-abc-01',
        errors: {
          Email: ['Email is required.', 'Email is not valid.'],
          'Lines[0].Quantity': ['Must be positive.'],
        },
      }),
    )
    assert.equal(e.kind, 'validation')
    assert.equal(e.status, 400)
    assert.equal(e.code, 'validation')
    assert.equal(e.traceId, '00-abc-01')
    assert.deepEqual(e.fieldErrors, {
      email: ['Email is required.', 'Email is not valid.'],
      'lines[0].quantity': ['Must be positive.'],
    })
    assert.equal(e.safeMessage, null)
  })

  test('ProblemDetails without validation errors', () => {
    const e = normalizeError(
      problem(422, { code: 'role_in_use', title: 'Role is in use', userCount: 3, traceId: 't1' }),
    )
    assert.deepEqual(e.fieldErrors, {})
    assert.equal(e.details.userCount, 3)
    assert.equal(e.traceId, 't1')
  })

  test('a server message is kept only when the API marks it safe, and never for 5xx', () => {
    assert.equal(
      normalizeError(problem(422, { code: 'x', title: 'Shown', safeToShow: true })).safeMessage,
      'Shown',
    )
    assert.equal(normalizeError(problem(422, { code: 'x', title: 'Hidden' })).safeMessage, null)
    assert.equal(
      normalizeError(problem(500, { title: 'NullReference at ...', safeToShow: true })).safeMessage,
      null,
    )
  })

  test('an AppError passes through unchanged', () => {
    const once = normalizeError(problem(404))
    assert.equal(normalizeError(once), once)
  })

  test('a refusal stored by the offline queue comes back as the same error', () => {
    const e = normalizeError(restoreError({ status: 422, code: 'visit-in-progress', title: 'Open visit' }))
    assert.equal(e.kind, 'conflict')
    assert.equal(e.code, 'visit-in-progress')
  })
})

describe('getErrorMessage', () => {
  test('translates a known problem code in Arabic and English', () => {
    const error = problem(422, { code: 'visit-in-progress', title: 'Another visit is open.' })
    assert.equal(getErrorMessage(error, tAr), ar.errors['visit-in-progress'])
    assert.equal(getErrorMessage(error, tEn), en.errors['visit-in-progress'])
  })

  test('fills values the message needs', () => {
    const error = problem(409, { code: 'role_in_use', userCount: 4 })
    assert.match(getErrorMessage(error, tEn), /4/)
    assert.match(getErrorMessage(error, tAr), /4/)
  })

  test('uses the generic text of the kind for status-only codes', () => {
    assert.equal(
      getErrorMessage(problem(403, { code: 'forbidden', title: 'You do not have access' }), tAr),
      ar.errors.kind.forbidden,
    )
    assert.equal(
      getErrorMessage(problem(404, { code: 'not-found', title: "Customer 'x' was not found." }), tEn),
      en.errors.kind.notFound,
    )
  })

  test('shows a server message marked safe when the code has no translation', () => {
    const error = problem(422, { code: 'brand-new-rule', title: 'Visits need a photo.', safeToShow: true })
    assert.equal(getErrorMessage(error, tEn), 'Visits need a photo.')
  })

  test('never shows raw server text that is not marked safe', () => {
    const internal = 'Npgsql.PostgresException: 23505 duplicate key value violates unique constraint'
    assert.equal(
      getErrorMessage(problem(500, { code: 'server-error', title: internal }), tEn),
      en.errors.kind.server,
    )
    assert.equal(
      getErrorMessage(problem(422, { code: 'brand-new-rule', title: internal }), tAr),
      ar.errors.kind.conflict,
    )
    assert.equal(getErrorMessage(new Error(internal), tEn), en.errors.kind.unknown)
  })

  test('every kind has a message in both languages', () => {
    for (const kind of Object.keys(en.errors.kind)) {
      assert.ok(ar.errors.kind[kind], `ar errors.kind.${kind}`)
    }
    assert.equal(getErrorMessage(new NetworkError(), tAr), ar.errors.kind.network)
    assert.equal(getErrorMessage(problem(429), tEn), en.errors.kind.rateLimited)
  })

  test('a client-side check shows its own (already translated) text', () => {
    assert.equal(getErrorMessage(new UserFacingError('الصورة كبيرة'), tEn), 'الصورة كبيرة')
  })

  test('a cancelled request has nothing to say', () => {
    assert.equal(getErrorMessage(new DOMException('aborted', 'AbortError'), tEn), '')
  })

  test('the reference id is offered for server and unexpected failures only', () => {
    assert.equal(getErrorReference(problem(500, { traceId: 'abc' })), 'abc')
    assert.equal(getErrorReference(problem(418, { traceId: 'def' })), 'def')
    assert.equal(getErrorReference(problem(400, { traceId: 'abc', errors: { a: ['b'] } })), null)
    assert.equal(getErrorReference(new NetworkError()), null)
  })
})

describe('applyFieldErrors', () => {
  test('maps errors to fields case-insensitively and returns the rest', () => {
    const set = {}
    const leftover = applyFieldErrors(
      problem(400, {
        errors: { FullName: ['Too long'], email: ['Taken', 'Second'], 'lines[0].qty': ['Bad'] },
      }),
      (field, message) => (set[field] = message),
      ['fullName', 'email', 'password'],
    )
    assert.deepEqual(set, { fullName: 'Too long', email: 'Taken' })
    assert.deepEqual(leftover, { 'lines[0].qty': ['Bad'] })
  })

  test('does nothing for errors without field errors', () => {
    let calls = 0
    assert.deepEqual(
      applyFieldErrors(new NetworkError(), () => calls++, ['email']),
      {},
    )
    assert.equal(calls, 0)
  })
})

describe('handleError toasts', () => {
  let now = 0
  let shown = []
  beforeEach(() => {
    resetErrorHandler()
    now = 1_000_000
    shown = []
    configureErrorHandler({ translate: tEn, notify: (toast) => shown.push(toast), now: () => now })
  })

  test('identical toasts within the window are shown once', () => {
    handleError(problem(403))
    handleError(problem(403))
    now += TOAST_DEDUPE_MS - 1
    handleError(problem(403))
    assert.equal(shown.length, 1)
    now += 2
    handleError(problem(403))
    assert.equal(shown.length, 2)
  })

  test('different messages are not merged', () => {
    handleError(problem(403))
    handleError(problem(404))
    assert.equal(shown.length, 2)
  })

  test('offline toasts wait longer and use the warning tone', () => {
    handleError(new NetworkError())
    now += TOAST_DEDUPE_MS * 3
    handleError(new TypeError('Failed to fetch'))
    assert.equal(shown.length, 1)
    assert.equal(shown[0].tone, 'warning')
    now += OFFLINE_TOAST_MS
    handleError(new NetworkError())
    assert.equal(shown.length, 2)
  })

  test('silent, toast: false and cancelled requests show nothing', () => {
    handleError(problem(500), { silent: true })
    handleError(problem(500), { toast: false })
    handleError(new DOMException('aborted', 'AbortError'))
    assert.equal(shown.length, 0)
  })

  test('a toast override replaces the derived text; server failures carry the reference', () => {
    handleError(problem(403), { toast: 'Custom text' })
    handleError(problem(500, { traceId: 'trace-9' }))
    assert.equal(shown[0].message, 'Custom text')
    assert.equal(shown[1].reference, 'Reference: trace-9')
  })

  test('returns the normalized error', () => {
    const e = handleError(problem(401, { code: 'invalid-refresh-token' }), { silent: true })
    assert.equal(e.kind, 'unauthorized')
  })
})
