import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveTileSource } from '../../src/features/tracking/live-map/tile-source.ts'

test('development falls back to the OpenStreetMap servers', () => {
  const source = resolveTileSource({})
  assert.deepEqual(source.tiles, ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'])
  assert.equal(source.tileSize, 256)
  assert.match(source.attribution, /OpenStreetMap/)
})

test('a configured provider replaces the default completely', () => {
  const source = resolveTileSource({
    VITE_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png?key=abc',
    VITE_MAP_TILE_ATTRIBUTION: 'Example Maps',
    VITE_MAP_TILE_SIZE: '512',
    VITE_MAP_TILE_MAX_ZOOM: '20',
  })
  assert.deepEqual(source, {
    tiles: ['https://tiles.example.test/{z}/{x}/{y}.png?key=abc'],
    tileSize: 512,
    maxzoom: 20,
    attribution: 'Example Maps',
  })
})

test('several tile servers can be listed', () => {
  const source = resolveTileSource({
    VITE_MAP_TILE_URL: 'https://a.test/{z}/{x}/{y}.png, https://b.test/{z}/{x}/{y}.png',
  })
  assert.equal(source.tiles.length, 2)
})

test('unusable numbers keep the defaults', () => {
  const source = resolveTileSource({
    VITE_MAP_TILE_URL: 'https://a.test/{z}/{x}/{y}.png',
    VITE_MAP_TILE_SIZE: 'large',
    VITE_MAP_TILE_MAX_ZOOM: '-1',
  })
  assert.equal(source.tileSize, 256)
  assert.equal(source.maxzoom, 19)
})
