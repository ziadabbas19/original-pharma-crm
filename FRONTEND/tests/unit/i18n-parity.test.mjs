import assert from 'node:assert/strict'
import { test } from 'node:test'
import ar from '../../src/lib/i18n/locales/ar.json' with { type: 'json' }
import en from '../../src/lib/i18n/locales/en.json' with { type: 'json' }

function keys(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

test('Arabic and English have the same keys', () => {
  const arKeys = new Set(keys(ar))
  const enKeys = new Set(keys(en))
  assert.deepEqual(
    [...arKeys].filter((k) => !enKeys.has(k)),
    [],
    'only in ar.json',
  )
  assert.deepEqual(
    [...enKeys].filter((k) => !arKeys.has(k)),
    [],
    'only in en.json',
  )
})

test('no translation is empty', () => {
  for (const [name, locale] of [
    ['ar', ar],
    ['en', en],
  ]) {
    const empty = keys(locale).filter((k) => k.split('.').reduce((n, p) => n[p], locale) === '')
    assert.deepEqual(empty, [], name)
  }
})
