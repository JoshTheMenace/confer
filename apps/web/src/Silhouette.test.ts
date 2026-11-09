import { expect, test } from 'vitest'
import { silhouetteSpec } from './Silhouette'

test('a silhouette depends only on the id', () => {
  expect(silhouetteSpec('diego')).toEqual(silhouetteSpec('diego'))
  expect(silhouetteSpec('diego').from).not.toBe(silhouetteSpec('diego').to)
})

test('different people look different', () => {
  const looks = ['amara', 'diego', 'priya', 'tomas', 'mei', 'kofi', 'sana', 'lars', 'noor', 'ife', 'yuki', 'rosa'].map((id) => JSON.stringify(silhouetteSpec(id)))
  expect(new Set(looks).size).toBe(looks.length)
})
