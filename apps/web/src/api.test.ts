import { expect, test } from 'vitest'
import { buildPath } from './api'

test('buildPath fills :id and encodes it', () => {
  expect(buildPath('POST /api/people/:id/share', { id: 'p 1/x' })).toBe('/api/people/p%201%2Fx/share')
  expect(buildPath('GET /api/people')).toBe('/api/people')
})

test('buildPath adds only the query values that are set', () => {
  expect(buildPath('GET /api/discover', undefined, { q: 'tracing 200 services' })).toBe('/api/discover?q=tracing+200+services')
  expect(buildPath('GET /api/discover', undefined, { q: undefined })).toBe('/api/discover')
})
