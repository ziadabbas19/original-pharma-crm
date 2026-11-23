import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../../src/', import.meta.url))
const COMPONENT = 'components/ui/password-input.tsx'

const files = readdirSync(src, { recursive: true })
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => ({ name: relative(src, join(src, file)), text: readFileSync(join(src, file), 'utf8') }))

test('no plain password input is left: only PasswordInput sets the password type', () => {
  const plain = files
    .filter((f) => f.name !== COMPONENT)
    .filter((f) =>
      /type=\{?\s*["'`]password["'`]|["']password["']\s*:\s*["']text["']|["']text["']\s*:\s*["']password["']/.test(
        f.text,
      ),
    )
    .map((f) => f.name)
  assert.deepEqual(plain, [])
  assert.ok(
    files.some((f) => f.name === COMPONENT),
    'the component exists',
  )
})

test('every field that asks the browser for a password is a PasswordInput', () => {
  const wrong = []
  for (const f of files.filter((f) => f.name !== COMPONENT)) {
    for (const match of f.text.matchAll(/autoComplete="(?:current|new)-password"/g)) {
      const tags = [...f.text.slice(0, match.index).matchAll(/<([A-Za-z][\w.]*)/g)]
      const tag = tags.at(-1)?.[1]
      if (tag !== 'PasswordInput') wrong.push(`${f.name}: <${tag}>`)
    }
  }
  assert.deepEqual(wrong, [])
  // Sign-in, the three change-password fields and the password set when creating a user.
  const count = files.reduce((n, f) => n + (f.text.match(/<PasswordInput\b/g)?.length ?? 0), 0)
  assert.ok(count >= 5, `${count} password fields`)
})
