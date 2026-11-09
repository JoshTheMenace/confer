import { expect, test } from 'vitest'
import { silhouetteSpec, silhouetteUrl } from './Silhouette'

test('a silhouette is the same every time for the same id', () => {
  expect(silhouetteUrl('p501')).toBe(silhouetteUrl('p501'))
  expect(silhouetteSpec('p501')).toEqual(silhouetteSpec('p501'))
})

test('twelve attendees get twelve different silhouettes', () => {
  const urls = Array.from({ length: 12 }, (_, i) => silhouetteUrl(`p${500 + i}`))
  expect(new Set(urls).size).toBe(12)
})
