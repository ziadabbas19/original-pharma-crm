import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isRowActivation,
  isRowKeyActivation,
  ROW_CLICK_IGNORE,
} from '../../src/components/data-table/row-click.ts'

/** A tiny element tree: closest() matches by tag or role, contains() walks the parents. */
function el(tag, parent = null, attrs = {}) {
  const node = { tag, parent, attrs }
  node.contains = (other) => {
    for (let n = other; n; n = n.parent) if (n === node) return true
    return false
  }
  node.closest = (selector) => {
    const parts = selector.split(',').map((s) => s.trim())
    for (let n = node; n; n = n.parent) {
      const hit = parts.some((p) => {
        const attr = /^\[([a-z-]+)(?:=([^\]]+))?\]$/.exec(p)
        if (attr) return attr[2] === undefined ? attr[1] in n.attrs : n.attrs[attr[1]] === attr[2]
        return p === n.tag
      })
      if (hit) return n
    }
    return null
  }
  return node
}

const table = el('table')
const row = el('tr', table)
const cell = el('td', row)
const text = el('span', cell)
const checkboxCell = el('td', row)
const checkbox = el('button', checkboxCell, { role: 'checkbox' })
const link = el('a', cell)
const actions = el('td', row, { 'data-no-row-click': '' })
const actionsGap = el('div', actions)
const menuButton = el('button', actions)
const radixCheckbox = el('span', checkboxCell, { role: 'checkbox' })
const dialog = el('div') // a dialog opened from the row, rendered elsewhere in the page

test('a plain click on the row runs the primary action', () => {
  assert.equal(isRowActivation({ target: text, row }), true)
  assert.equal(isRowActivation({ target: cell, row }), true)
  assert.equal(isRowActivation({ target: row, row }), true)
})

test('checkboxes, links, buttons and the actions menu keep their own click', () => {
  assert.equal(isRowActivation({ target: checkbox, row }), false)
  assert.equal(isRowActivation({ target: radixCheckbox, row }), false)
  assert.equal(isRowActivation({ target: link, row }), false)
  assert.equal(isRowActivation({ target: menuButton, row }), false)
  assert.equal(isRowActivation({ target: actionsGap, row }), false)
})

test('selecting text, other mouse buttons and clicks from outside the row do not count', () => {
  assert.equal(isRowActivation({ target: text, row, selectedText: 'Dr. Ahmed' }), false)
  assert.equal(isRowActivation({ target: text, row, selectedText: '  ' }), true)
  assert.equal(isRowActivation({ target: text, row, button: 1 }), false)
  assert.equal(isRowActivation({ target: dialog, row }), false)
  assert.equal(isRowActivation({ target: null, row }), false)
})

test('the ignore list covers the usual controls', () => {
  for (const part of [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'label',
    '[role=checkbox]',
    '[role=menuitem]',
  ])
    assert.ok(ROW_CLICK_IGNORE.split(', ').includes(part), part)
})

test('Enter (or Space) on the focused row itself opens it; keys on controls inside do not', () => {
  assert.equal(isRowKeyActivation('Enter', true), true)
  assert.equal(isRowKeyActivation(' ', true), true)
  assert.equal(isRowKeyActivation('Enter', false), false)
  assert.equal(isRowKeyActivation('a', true), false)
})
