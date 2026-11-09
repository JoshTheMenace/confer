import { expect, test } from 'vitest'
import { tagGrid } from './TagSvg'

// Official renders (██ = black, ·· = white), including the 1-cell white quiet zone.
const OFFICIAL: Record<number, string> = {
  0: `
····················
··████████████████··
··██····██··██··██··
··████······██··██··
··████····████████··
··██··██··████████··
··████··██····████··
··████████··██████··
··████████████████··
····················`,
  1: `
····················
··████████████████··
··██····██····████··
··████··██······██··
··██········██████··
··████····████████··
··██··██····██··██··
··██████··████··██··
··████████████████··
····················`,
}

const parse = (art: string) => art.trim().split('\n').map((row) => [...row].filter((_, i) => i % 2 === 0).map((c) => c === '█'))

test.each([0, 1])('tag %i matches the official tag36h11 image', (id) => {
  expect(tagGrid(id)).toEqual(parse(OFFICIAL[id]))
})

test('rejects ids outside the family', () => {
  expect(() => tagGrid(587)).toThrow(RangeError)
})
