import { expect, test } from 'vitest'
import { announcement, freshIds, toGray } from './Scanner'

test('group catch fires every new id in a frame once', () => {
  expect(freshIds([12, 40, 12], new Map(), 0)).toEqual([12, 40])
})

test('same id stays quiet for 4s after it was last seen', () => {
  const seen = new Map<number, number>()
  freshIds([12], seen, 0)
  expect(freshIds([12, 7], seen, 3999)).toEqual([7])
  expect(freshIds([12], seen, 7998)).toEqual([]) // seen at 3999, so still within 4s
  expect(freshIds([12], seen, 11998)).toEqual([12])
})

test('grayscale maps white to 255 and black to 0', () => {
  expect([...toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))]).toEqual([255, 0])
})

test('announcement reads naturally', () => {
  expect(announcement([12])).toBe('Caught badge 12')
  expect(announcement([12, 40])).toBe('Caught badges 12 and 40')
})
