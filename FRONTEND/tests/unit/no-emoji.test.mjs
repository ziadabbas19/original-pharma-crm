import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findEmoji } from '../../scripts/check-no-emoji.mjs'

// Inputs are built from code points so this file itself passes the check.
const s = (...codePoints) => String.fromCodePoint(...codePoints)
const codes = (text) => findEmoji(text).map((f) => f.codePoint)

test('finds pictographs, flags, keycaps, skin tones and the emoji variation selector', () => {
  assert.deepEqual(codes(`Done ${s(0x1f389)}`), ['U+1F389'])
  assert.deepEqual(codes(`${s(0x26a0, 0xfe0f)} careful`), ['U+26A0', 'U+FE0F'])
  assert.deepEqual(codes(s(0x1f1ea, 0x1f1ec)), ['U+1F1EA', 'U+1F1EC'])
  assert.deepEqual(codes(`1${s(0xfe0f, 0x20e3)}`), ['U+FE0F', 'U+20E3'])
  assert.deepEqual(codes(s(0x1f44d, 0x1f3fd)), ['U+1F44D', 'U+1F3FD'])
  assert.deepEqual(codes(s(0x2714, 0x20, 0x2b50, 0x20, 0xa9)), ['U+2714', 'U+2B50', 'U+00A9'])
})

test('leaves letters, digits, punctuation and plain typographic symbols alone', () => {
  const symbols = s(
    0x2192,
    0x2190,
    0x2713,
    0x2717,
    0x2022,
    0xb7,
    0x2026,
    0x2014,
    0xab,
    0xbb,
    0x2264,
    0x2500,
    0x200f,
  )
  assert.deepEqual(findEmoji(`${s(0x645, 0x631, 0x62d, 0x628, 0x627)} - Hello 123 ${symbols}`), [])
})

test('reports line and column', () => {
  assert.deepEqual(findEmoji(`a\nab${s(0x1f600)}`), [{ line: 2, column: 3, codePoint: 'U+1F600' }])
})
