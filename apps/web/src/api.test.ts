import { expect, test } from 'vitest'
import { buildPath } from './api'

test('buildPath fills :id, encodes it, and drops empty query values', () => {
  expect(buildPath('POST /api/people/:id/share', { params: { id: 'a b/c' } })).toBe('/api/people/a%20b%2Fc/share')
  expect(buildPath('GET /api/discover', { query: { q: 'tracing & spans' } })).toBe('/api/discover?q=tracing+%26+spans')
  expect(buildPath('GET /api/discover', { query: { q: undefined } })).toBe('/api/discover')
})
