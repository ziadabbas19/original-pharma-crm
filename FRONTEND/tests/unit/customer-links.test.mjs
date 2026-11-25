import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapsHref, telHref } from '../../src/features/visits/customer-links.ts'

test('Call: a tel: link from the number as typed, or nothing', () => {
  assert.equal(telHref('0100 123 4567'), 'tel:01001234567')
  assert.equal(telHref('+20 (100) 123-4567'), 'tel:+201001234567')
  assert.equal(telHref('٠١٠٠١٢٣٤٥٦٧'), 'tel:01001234567')
  assert.equal(telHref('12+34'), 'tel:1234')
  assert.equal(telHref(''), null)
  assert.equal(telHref(null), null)
  assert.equal(telHref(undefined), null)
  assert.equal(telHref('n/a'), null)
  assert.equal(telHref('12'), null)
})

test('Navigate: directions to the coordinates, else to the address, else nothing', () => {
  assert.equal(
    mapsHref({ lat: 30.0561, lng: 31.3302, address: 'ignored' }),
    'https://www.google.com/maps/dir/?api=1&destination=30.0561,31.3302',
  )
  assert.equal(mapsHref({ lat: 0, lng: 0 }), 'https://www.google.com/maps/dir/?api=1&destination=0,0')
  assert.equal(
    mapsHref({ lat: null, lng: null, address: '12 Abbas El Akkad St', townName: 'Nasr City' }),
    'https://www.google.com/maps/dir/?api=1&destination=12%20Abbas%20El%20Akkad%20St%2C%20Nasr%20City',
  )
  assert.equal(
    mapsHref({ address: 'شارع عباس العقاد' }),
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('شارع عباس العقاد')}`,
  )
  assert.equal(mapsHref({ lat: 30.05, lng: null, address: '  ' }), null)
  assert.equal(mapsHref({}), null)
  assert.equal(mapsHref({ lat: Number.NaN, lng: 31 }), null)
})
