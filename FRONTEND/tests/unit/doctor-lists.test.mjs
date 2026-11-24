import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slotMatches } from '../../src/features/doctors/availability.ts'
import { nameCloseness, normalizeName, searchByName } from '../../src/features/doctors/name-search.ts'

test('names are normalized like the server does', () => {
  const cases = [
    ['أحمد محمد', 'احمد محمد'],
    ['إحمد', 'احمد'],
    ['آمال', 'امال'],
    ['مُحَمَّد', 'محمد'],
    ['محـــمد', 'محمد'],
    ['مصطفى', 'مصطفي'],
    ['فاطمة', 'فاطمه'],
    ['مؤمن', 'مومن'],
    ['هانئ', 'هاني'],
    ['  أحمد \t  محمد  ', 'احمد محمد'],
    ['د. أحمد فتحي', 'احمد فتحي'],
    ['د.أحمد', 'احمد'],
    ['د/ أحمد', 'احمد'],
    ['دكتورة منى', 'مني'],
    ['Dr. Ahmed  Fathy', 'ahmed fathy'],
    ['dr.ahmed', 'ahmed'],
    ['Drew Smith', 'drew smith'],
    ['دكتوراه', 'دكتوراه'],
    ['', ''],
    [null, ''],
  ]
  for (const [name, expected] of cases) assert.equal(normalizeName(name), expected, String(name))
})

test('every hamza form finds the name, closest first', () => {
  for (const text of ['احمد', 'أحمد', 'إحمد']) {
    const term = normalizeName(text)
    assert.equal(nameCloseness(['أحمد'], term), 0)
    assert.equal(nameCloseness(['Dr. Ahmed Fathy', 'د. أحمد فتحي'], term), 1)
    assert.equal(nameCloseness(['محمد أحمد'], term), 2)
    assert.equal(nameCloseness(['عبد الأحمدي'], term), 3)
    assert.equal(nameCloseness(['منى سعيد'], term), null)
  }
})

test('the search keeps matching rows only, closest names first, then by name, then other matches', () => {
  const rows = [
    { name: 'عبد الأحمدي', phone: null },
    { name: 'Dr. Mona Saeed', nameAr: 'د. منى سعيد', phone: '0100' },
    { name: 'محمد أحمد', phone: null },
    { name: 'Dr. Ahmed Fathy', nameAr: 'د. أحمد فتحي', phone: '0101' },
    { name: 'د. أحمد', phone: null },
  ]
  const names = (row) => [row.name, row.nameAr]
  assert.deepEqual(
    searchByName(rows, 'إحمد', names, (row) => row.phone).map((row) => row.name),
    ['د. أحمد', 'Dr. Ahmed Fathy', 'محمد أحمد', 'عبد الأحمدي'],
  )
  assert.deepEqual(
    searchByName(rows, '0100', names, (row) => row.phone).map((row) => row.name),
    ['Dr. Mona Saeed'],
  )
  assert.equal(searchByName(rows, '  ', names).length, rows.length)
})

test('the time search matches slots overlapping the window; touching ends do not', () => {
  const saturday = (start, end) => ({ weekday: 'saturday', start, end })
  const window = { weekday: 'saturday', from: '17:45', to: '18:00' }
  assert.equal(slotMatches(saturday('17:00', '18:00'), window), true)
  assert.equal(slotMatches(saturday('17:00', '17:50'), window), true)
  assert.equal(slotMatches(saturday('16:00', '17:45'), window), false)
  assert.equal(slotMatches(saturday('18:00', '19:00'), window), false)
  assert.equal(slotMatches(saturday('17:00', '20:00'), window), true)
  assert.equal(slotMatches(saturday('17:50', '17:55'), window), true)
  // Only "from": available at that minute. Only "to": starts before it.
  assert.equal(slotMatches(saturday('17:00', '18:00'), { from: '17:00' }), true)
  assert.equal(slotMatches(saturday('17:00', '18:00'), { from: '16:59' }), false)
  assert.equal(slotMatches(saturday('17:00', '18:00'), { from: '18:00' }), false)
  assert.equal(slotMatches(saturday('17:00', '18:00'), { to: '17:00' }), false)
  // Next to midnight.
  assert.equal(slotMatches(saturday('00:00', '00:30'), { from: '00:00', to: '00:15' }), true)
  assert.equal(slotMatches(saturday('23:00', '23:59'), { from: '23:30', to: '23:59' }), true)
  assert.equal(slotMatches(saturday('23:00', '23:59'), { from: '23:59' }), false)
})
